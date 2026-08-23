/* SNSpartan — Spartan intelligence law for Astranov
 * =================================================
 * One word (or few) → research what must be done → execute full chain → short reply.
 * Not chatty. Not partial. Not “here are options” when intent is action.
 * Owner law 2026-08-01: train every domain this way.
 */
(function (g) {
  'use strict';

  var LAW = {
    name: 'Spartan intelligence',
    creed:
      'Minimal signal · maximal action. One word is enough when context is the real Earth OS.',
    rules: [
      'Expand short input into the full mission the user would need if they wrote a paragraph.',
      'Research: locate · crawl · rank · choose · act · pay/route/assign when the domain needs it.',
      'Prefer doing over asking; only ask when GPS is soft or money is missing.',
      'Reply Spartan: least words. Example: Driver 6 min late. 3 min to eat. Door.',
      'Always listen first. If user may still speak — stop, wait, think, then reply.',
      'Same law for food, map, YouTube, search, driver, shops, pilot, money, bridge, cancel — full internet OS.',
      'Never invent shops or drivers; use crawlers and live mesh.',
      'Remember prefs (size, drinks, home, favorites) so next one-word is smarter.',
    ],
    listenFirst: true,
    /** ms to wait after final speech when user may continue */
    listenHoldMs: 1400,
    /** ms think pause before speaking/reply after input commits */
    thinkMs: 450,
    maxReplyChars: 72,
    maxReplySentences: 3,
  };

  function norm(s) {
    var t = String(s || '').trim();
    try {
      if (g.SNGreeklish && SNGreeklish.normalize) t = SNGreeklish.normalize(t);
    } catch (_) {}
    try {
      if (g.ArcangeloDialect && ArcangeloDialect.normalizeForRouting) {
        t = ArcangeloDialect.normalizeForRouting(t) || t;
      }
    } catch (_) {}
    return String(t || '').trim();
  }

  function tokens(s) {
    return norm(s)
      .toLowerCase()
      .replace(/[^a-z0-9α-ωά-ώίϊΐόύϋΰήώ\s]/gi, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  /** Domain lexicon — one token can open a full chain */
  var DOMAINS = [
    {
      id: 'food',
      re: /^(pizza|sushi|burger|coffee|cafe|souvlaki|pitogyra|gyro|kebab|pasta|food|hungry|φαγητ|πιτσα|καφε|σουβλα)/i,
      words: ['pizza', 'sushi', 'burger', 'coffee', 'souvlaki', 'pitogyra', 'food'],
      expand: function (raw, tok) {
        var food = tok[0] || 'food';
        if (/hungry|φαγητ/.test(food)) food = 'food';
        return {
          domain: 'food',
          intent: 'order_full',
          spartan: true,
          steps: ['locate', 'crawl_shops', 'rank_open_rated', 'judge_prefs', 'pay', 'driver', 'route', 'eta_watch'],
          food: food,
          autoOrder: true,
          lazyJudge: true,
          browseOnly: false,
          replySeed: 'Spartan · ' + food + ' · locate → best open → order → driver → ETA',
          mission: {
            steps: ['locate', 'shops', 'order'],
            foodLine: raw,
            autoOrder: true,
          },
          runFood: true,
        };
      },
    },
    {
      id: 'locate',
      re: /^(locate|gps|here|me|που\s*ειμαι|βρες)$/i,
      expand: function (raw) {
        return {
          domain: 'locate',
          intent: 'locate',
          spartan: true,
          steps: ['gps', 'map_pin', 'city'],
          mission: { steps: ['locate'], foodLine: raw },
          replySeed: 'Spartan · pin you on the map',
        };
      },
    },
    {
      id: 'shops',
      re: /^(shops|shop|vendors|crawl|scan|stores|μαγαζ)/i,
      expand: function (raw) {
        return {
          domain: 'shops',
          intent: 'populate_vendors',
          spartan: true,
          steps: ['locate', 'crawl_osm_places', 'menus', 'map_tiles'],
          mission: { steps: ['locate', 'shops'], foodLine: raw },
          replySeed: 'Spartan · fill real shops on the map',
        };
      },
    },
    {
      id: 'youtube',
      re: /^(youtube|yt|video|videos|βιντεο|βίντεο)$/i,
      words: ['youtube', 'yt', 'video'],
      expand: function (raw) {
        return {
          domain: 'youtube',
          intent: 'open_youtube',
          spartan: true,
          steps: ['ensure_module', 'search_or_hint'],
          runYoutube: true,
          youtubeQuery: '',
          replySeed: 'Spartan · youtube · say youtube <query> or yt cats',
        };
      },
    },
    {
      id: 'drive',
      re: /^(drive|courier|driver)$/i,
      expand: function () {
        return {
          domain: 'drive',
          intent: 'driver_online',
          spartan: true,
          steps: ['profile_driver', 'online', 'pull_orders'],
          runDriveOn: true,
          replySeed: 'Spartan · you are courier online',
        };
      },
    },
    {
      id: 'deliver',
      re: /^(deliver|delivered|drop|complete)$/i,
      expand: function () {
        return {
          domain: 'deliver',
          intent: 'complete_delivery',
          spartan: true,
          steps: ['claim', 'settle', 'ledger'],
          runDeliver: true,
          replySeed: 'Spartan · complete + settle',
        };
      },
    },
    {
      id: 'cancel',
      re: /^(cancel|stop|abort|nevermind)$/i,
      expand: function () {
        return {
          domain: 'cancel',
          intent: 'cancel',
          spartan: true,
          steps: ['clear_pending', 'refund_if_needed'],
          cli: 'cancel',
          replySeed: 'Spartan · cancel',
        };
      },
    },
    {
      id: 'pilot',
      re: /^(pilot|home|telemachos|τηλεμαχ)/i,
      expand: function (raw) {
        return {
          domain: 'pilot',
          intent: 'pilot_home',
          spartan: true,
          steps: ['nav_home'],
          cli: /telemachos|τηλεμαχ/i.test(raw) ? 'telemachos' : 'pilot home',
          replySeed: 'Spartan · pilot',
        };
      },
    },
    {
      id: 'money',
      re: /^(money|wallet|vault|balance|coins|αc)$/i,
      expand: function (raw) {
        return {
          domain: 'money',
          intent: 'wallet',
          spartan: true,
          steps: ['balance', 'vault'],
          cli: /vault/i.test(raw) ? 'vault' : 'wallet',
          replySeed: 'Spartan · wallet',
        };
      },
    },
    {
      id: 'bridge',
      re: /^(bridge|agent|fix|grok)$/i,
      expand: function (raw) {
        return {
          domain: 'bridge',
          intent: 'bridge',
          spartan: true,
          steps: ['status'],
          cli: /test/i.test(raw) ? 'bridge test' : 'bridge status',
          replySeed: 'Spartan · bridge',
        };
      },
    },
    {
      id: 'ready',
      re: /^(ready|status|go)$/i,
      expand: function () {
        return {
          domain: 'ready',
          intent: 'readiness',
          spartan: true,
          steps: ['engine_check'],
          cli: 'ready score',
          replySeed: 'Spartan · readiness',
        };
      },
    },
    {
      id: 'help',
      re: /^(help|\?|commands)$/i,
      expand: function () {
        return {
          domain: 'help',
          intent: 'help',
          spartan: true,
          steps: ['brief_help'],
          replySeed:
            'Spartan · one word is enough: pizza · shops · locate · drive · deliver · cancel · pilot · vault',
          replyOnly: true,
        };
      },
    },
  ];

  /**
   * Expand any short line into a Spartan plan.
   * Returns null if input is long/chatty and should use normal parsers.
   */
  function expand(message) {
    var raw = String(message || '').trim();
    if (!raw) return null;
    // Greek / Greeklish / Archangelos → English command first
    try {
      if (g.ArcangeloDialect && ArcangeloDialect.normalizeForRouting) {
        var routed = ArcangeloDialect.normalizeForRouting(raw);
        if (routed) raw = routed;
      } else if (g.SNGreeklish && SNGreeklish.toEnglishCommand) {
        var eng0 = SNGreeklish.toEnglishCommand(raw);
        if (eng0) raw = eng0;
      }
    } catch (_) {}
    var low = norm(raw).toLowerCase();
    var tok = tokens(raw);

    // Long explicit sentences: still tag spartan if food/order already clear, else null
    var short = tok.length <= 4 || raw.length <= 28;

    // Direct domain match on first token or whole short line
    var i;
    for (i = 0; i < DOMAINS.length; i++) {
      var d = DOMAINS[i];
      if (d.re.test(tok[0] || '') || d.re.test(low.trim())) {
        var plan = d.expand(raw, tok);
        plan.raw = raw;
        plan.tokens = tok;
        plan.law = LAW.name;
        return plan;
      }
      if (d.words) {
        var w;
        for (w = 0; w < d.words.length; w++) {
          if (low.indexOf(d.words[w]) >= 0 && short) {
            plan = d.expand(raw, tok);
            plan.raw = raw;
            plan.tokens = tok;
            plan.law = LAW.name;
            return plan;
          }
        }
      }
    }

    // Compound short: "pizza home" etc. already handled by food if pizza present
    if (short && g.SNMarket && SNMarket.parseFoodIntent) {
      try {
        var fi = SNMarket.parseFoodIntent(raw);
        if (fi && fi.food) {
          return {
            domain: 'food',
            intent: 'order_full',
            spartan: true,
            steps: ['locate', 'crawl_shops', 'rank_open_rated', 'judge_prefs', 'pay', 'driver', 'route', 'eta_watch'],
            food: fi.food,
            autoOrder: true,
            lazyJudge: true,
            browseOnly: false,
            runFood: true,
            foodIntent: Object.assign({}, fi, {
              autoOrder: true,
              lazyJudge: true,
              browseOnly: false,
              spartan: true,
            }),
            raw: raw,
            replySeed: 'Spartan · ' + fi.food,
            law: LAW.name,
          };
        }
      } catch (_) {}
    }

    // Task runner plan for medium phrases
    if (g.SNTaskRunner && SNTaskRunner.planFromText) {
      try {
        var mp = SNTaskRunner.planFromText(raw);
        if (mp && mp.steps && mp.steps.length) {
          return {
            domain: 'mission',
            intent: 'mission',
            spartan: short,
            steps: mp.steps,
            mission: mp,
            raw: raw,
            replySeed: 'Spartan · ' + mp.steps.join('→'),
            law: LAW.name,
          };
        }
      } catch (_) {}
    }

    return null;
  }

  function teachMind() {
    try {
      var M = g.SNAstranovMind || g.SNFreeMind;
      if (!M || !M.teach) return;
      LAW.rules.forEach(function (r, idx) {
        M.teach('spartan law ' + (idx + 1), r, ['spartan', 'law', 'train']);
      });
      M.teach(
        'what is spartan intelligence',
        LAW.creed +
          ' Full OS: youtube cats · pizza → locate → shops → order → driver · locate · dark map · pilot · search. One word expands to full chain.',
        ['spartan', 'identity']
      );
      M.teach(
        'spartan replies how you speak',
        'Least words. Driver 6 min late. 3 min to eat. Door. Listen first. Wait if more coming. Think then reply.',
        ['spartan', 'reply', 'listen']
      );
      M.teach(
        'spartan mode how you think',
        'Spartan: expand one word into full real-Earth action chain. Research then act. Short answer with ETA/result.',
        ['spartan', 'think']
      );
    } catch (_) {}
  }


  /**
   * Spartan compress — least words that still carry the mission.
   * "Driver is approximately six minutes late. You should go to the door."
   * → "Driver 6 min late. Door."
   */
  function compress(text, opts) {
    opts = opts || {};
    var max = opts.max != null ? opts.max : LAW.maxReplyChars || 72;
    var maxS = opts.sentences != null ? opts.sentences : LAW.maxReplySentences || 3;
    var t = String(text || '').trim();
    if (!t) return '';
    // strip brand fluff
    t = t
      .replace(/^SpaceNet\s*[·:.-]\s*/gi, '')
      .replace(/^Astranov\s*[·:.-]\s*/gi, '')
      .replace(/^Spartan\s*[·:.-]\s*/gi, '')
      .replace(/\bSpaceNet\b/gi, '')
      .replace(/\bI will (ping|notify|alert)[^.!]*[.!]?/gi, '')
      .replace(/\bI(?:'m| am) (going to|gonna)\b/gi, '')
      .replace(/\bPlease\b/gi, '')
      .replace(/\bAlright[,.]?\s*/gi, '')
      .replace(/\bOkay[,.]?\s*/gi, '')
      .replace(/\bOn it[,.—-]*\s*/gi, '')
      .replace(/\bLooking for\b/gi, '')
      .replace(/\bfinding you now\b/gi, 'Locate')
      .replace(/\byou(?:'re| are) eating at\b/gi, 'Eat')
      .replace(/\bYou eat\s*~/gi, 'Eat ')
      .replace(/\byou should (?:go to )?(?:the )?door\b/gi, 'Door')
      .replace(/\bgo to the door\b/gi, 'Door')
      .replace(/\bpeel(?: the)? door\b/gi, 'Door')
      .replace(/\bbe ready at drop pin\b/gi, 'Door')
      .replace(/\bdriver is (?:approximately |about |roughly )?(\d+)\s*minutes?\s*(late)?/gi, 'Driver $1 min$2')
      .replace(/\bapproximately\b/gi, '')
      .replace(/\babout\b/gi, '')
      .replace(/\broughly\b/gi, '')
      .replace(/\bminutes?\b/gi, 'min')
      .replace(/\bminute\b/gi, 'min')
      .replace(/\bseconds?\b/gi, 's')
      .replace(/\bdriver is\b/gi, 'Driver')
      .replace(/\bthe driver\b/gi, 'Driver')
      .replace(/\band peel it\.?/gi, '')
      .replace(/\byou should\b/gi, '')
      .replace(/\balmost there\b/gi, '')
      .replace(/\bon the way\b/gi, 'en route')
      .replace(/\s*[·|]\s*/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\.+\s*\./g, '.')
      .trim();

    // Prefer short sentences
    var parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (parts.length > maxS) parts = parts.slice(0, maxS);
    t = parts.join(' ');
    // Drop filler words
    t = t
      .replace(/\b(just|really|actually|basically|currently|simply|please|kind of|sort of)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.!])/g, '$1')
      .trim();
    if (t.length > max) {
      t = t.slice(0, max).replace(/\s+\S*$/, '').replace(/[,:;]+$/, '') + '.';
    }
    // Ensure end punctuation if multi-word
    if (t && !/[.!?]$/.test(t) && t.length > 12) t += '.';
    return t;
  }

  function thinkDelay() {
    return Math.max(0, Number(LAW.thinkMs) || 450);
  }

  function listenHoldMs() {
    return Math.max(400, Number(LAW.listenHoldMs) || 1400);
  }

  /** Suspicion user may still speak: trailing filler, incomplete, or short pause pattern */
  function mayStillSpeak(text, interim) {
    var t = String(text || '').trim();
    if (interim) return true;
    if (!t) return true;
    // trailing connectors
    if (/\b(and|or|with|to|for|the|a|uh|um|ε|και|να|θέλω)\s*$/i.test(t)) return true;
    if (/[,;…]\s*$/.test(t)) return true;
    // very short mid-thought
    if (t.split(/\s+/).length <= 1 && t.length < 12 && !/^(pizza|cancel|locate|shops|drive|deliver|help|stop|youtube|yt|video)$/i.test(t))
      return true;
    return false;
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, ms || 0));
    });
  }


  function briefResult(plan, resultText) {
    return compress(resultText || (plan && plan.replySeed) || 'Done');
  }

  // boot train once
  try {
    if (typeof document !== 'undefined') {
      setTimeout(teachMind, 2500);
    }
  } catch (_) {}

  g.SNSpartan = {
    LAW: LAW,
    expand: expand,
    teachMind: teachMind,
    briefResult: briefResult,
    compress: compress,
    thinkDelay: thinkDelay,
    listenHoldMs: listenHoldMs,
    mayStillSpeak: mayStillSpeak,
    wait: wait,
    domains: function () {
      return DOMAINS.map(function (d) {
        return d.id;
      });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
