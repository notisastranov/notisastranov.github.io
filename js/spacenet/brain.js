/* Astranov SpaceNet BRAIN — permanent product memory.
 * Amnesia almost killed the project and burned the owner's time/money.
 * This module is the machine-readable law every AI + CLI + agent must load.
 * Docs: ASTRANOV_SPACENET_GUIDE.md · support/PRODUCT-RULES.md
 * Authority: live js/spacenet/* → PRODUCT-RULES → mission → guide → CLAUDE
 */
(function (global) {
  'use strict';

  const MEM_KEY = 'sn:brain-mem-v1';
  const BUILD =
    (typeof document !== 'undefined' &&
      document.querySelector('meta[name="astranov-build"]')?.content) ||
    '?';

  const LAW = {
    version: '2026-08-05-brain-v3-audit-fix',
    name: 'Astranov SpaceNet',
    why:
      'Amnesia loops (rewrite-from-zero, strip inertia/CLI, chase FPS, forget juice) almost killed the project and cost the owner real money and years of focus. Memory is not optional.',
    mission:
      'Unify internet activity under realistic space imagery via SPACENET (GLOBAL→NATIONAL→REGIONAL→CITY) — and evolve the internet into SpaceNet. Full INTERNET OPERATING SYSTEM + advanced 3D globe browser that can do anything.',
    spacenet: {
      name: 'SPACENET',
      law: 'Pilot fly grid net — without SPACENET, flying on the net is not possible',
      path: 'GLOBAL → NATIONAL → REGIONAL → CITY',
      file: 'js/spacenet/spacenet-grid.js',
      api: 'window.SPACENET · SNGlobe.diveInAt',
    },
    identity: {
      coldBoot: 'Silent globe (Greece-centered) + CLI. No persistent nav chrome.',
      globePrimacy: '3D Earth is the only permanent UI surface.',
      realism: 'Real geocoding, routing, WebRTC, geolocation, live crawlers. No fake city data as primary.',
      ai: 'Astranov Mind — full INTERNET OPERATING SYSTEM + advanced 3D globe browser. Can do anything (map, YouTube, pilot, order, search, code, social, crawl). Permanent owner memory. LANGUAGE LAW: English/Greek priority; NEVER Russian unless user wrote Russian. Never shops-only bot. Brand: Astranov.',
    },
    authority: [
      'Live code index.html + js/spacenet/* (+ astranov-continuity.js when present)',
      'support/PRODUCT-RULES.md',
      'ASTRANOV_SPACENET_MISSION.md',
      'ASTRANOV_SPACENET_GUIDE.md',
      'CLAUDE.md / AGENTS.md (entry only)',
      'Chat history is NOT authority',
    ],
    sacred: {
      globe: {
        naturalTurn: true,
        sensitivity: '0.005–0.0062',
        inertia: true,
        velKeys: ['velX', 'velY'],
        dampRange: [0.88, 0.94],
        tiers: ['solar', 'global', 'national', 'regional', 'city', 'street'],
        spacenet: 'GLOBAL→NATIONAL→REGIONAL→CITY',
        alwaysBackToEarth: true,
        owner: 'js/spacenet/globe.js + spacenet-grid.js',
      },
      cli: {
        oneFingerDrag: true,
        handle: '#cli-drag',
        freeDock: true,
        posKey: 'sn:cli-pos-v1',
        sizeKey: 'sn:cli-size-v1',
        sizes: ['collapsed', 'mid', 'expanded'],
        scrollableLog: true,
        expandRetract: true,
        owner: 'js/spacenet/ui.js → bindCliDrag()',
      },
    },
    juice: [
      { id: 'unified_tile', what: 'One tile: cover/avatar + social/dating/vendor/driver/client/worker roles' },
      { id: 'crawlers', what: 'Almighty SNSearch.crawl — geo/POI/web/wiki/code/products/media/books/weather/edge' },
      { id: 'code_brain', what: 'SNAi.code / coders — Grok-fork writes SpaceNet modules' },
      { id: 'city_maps', what: 'Leaflet targets open multi-role tiles' },
      { id: 'youtube', what: 'SNYoutube tile — youtube/yt/watch/play N · AI [[YOUTUBE:]] · autoplay' },
      { id: 'invaders', what: 'SNInvaders cockpit — tilt phone · guns/lasers/missiles · no joystick' },
      { id: 'sn_engine', what: 'SNEngine gaming power core — one RAF · quality tiers · frame budget · whole OS' },
      { id: 'vendor_menus', what: 'Menu items with photos + prices → cart → order → delivery task' },
      { id: 'jobs', what: 'job … → list → claim → complete on globe' },
      { id: 'dating', what: 'dating profiles + date invite DNA' },
      { id: 'delivery', what: 'driver profiles online + claim deliveries' },
      { id: 'errands', what: 'errand … same DNA' },
      { id: 'marketplace', what: 'browse → cart → order → track' },
      {
        id: 'first_loop',
        what: 'AI-coached first shop list + self-delivery (list shop → menu → order me → drive → deliver me)',
      },
      { id: 'usage_ship', what: 'SNUsage events + handoff → one fix per Athens midnight' },
      { id: 'ai', what: 'Single collective intelligence Astranov — full internet OS, not shops-only' },
    ],
    commands: [
      'job barman 3h',
      'date coffee',
      'deliver food',
      'errand pharmacy',
      'task list',
      'task claim',
      'crawl restaurants',
      'find anything',
      'search X',
      'youtube cats',
      'invaders',
      'engine',
      'engine auto',
      'fps',
      'space invaders',
      'close invaders',
      'yt lo-fi',
      'watch https://youtu.be/…',
      'play 2',
      'yt close',
      'code write …',
      'coders …',
      'research X',
      'locate',
      'city',
      'fly athens',
      'solar',
      'global',
      'national',
      'city',
      'earth',
      'help',
      'solo',
      'brain',
      'verify',
      'law',
    ],
    antiPatterns: [
      'Strip inertia / zero velX·velY / remove damp',
      'Remove one-finger CLI drag, free dock, or pos/size persistence',
      'Non-scrollable or non-retractable CLI',
      'Full rewrite from zero that drops juice',
      'Re-enable 1MB phase/deferred packs as default boot',
      'Treat chat transcripts as higher authority than live code + guide',
      'Persistent rectangles / nav bars as primary UI',
      'Fake city data instead of crawler-fed places',
      'seedCity NPC people / seedDemo auto tasks / demo vendors',
      'Invented default menus / random jitter coords / seed-* spatial demos',
      'Any dummy path on live stack (SPECS P0-D zero dummy)',
      'Delete features to go faster — measure + lazy-load instead',
      'Claim done without live probe of build stamp + physics + CLI',
      'Treat AI as shops-only or pizza-only bot',
      'Speak Russian unless user wrote Russian/Cyrillic',
      'Default TTS to navigator.language when it is Russian',
    ],
    mindset: [
      'Extend js/spacenet/* — never erase memory to chase FPS',
      'Sacred physics first; then juice only',
      'Every street action paints the globe/map',
      'Update guide + PRODUCT-RULES + this brain when owner adds a rule',
      'Deploy yourself; bump astranov-build + ?v=',
      'Full internet OS: map + YouTube + search + commerce + pilot + code',
      'LANGUAGE LAW: same language as user; EN/EL priority; never accidental Russian',
    ],
    modules: {
      'js/spacenet/brain.js': 'THIS — permanent AI product memory',
      'js/spacenet/globe.js': 'Inertia + zoom tiers',
      'js/spacenet/ui.js': 'CLI drag + expand',
      'js/spacenet/cli.js': 'Street commands + YouTube + multilingual TTS',
      'js/spacenet/youtube.js': 'YouTube tile (Piped + nocookie embed)',
      'js/spacenet/invaders.js': 'Space Invaders cockpit (tilt + weapons)',
      'js/spacenet/search.js': 'Crawlers',
      'js/spacenet/map.js': 'City map',
      'js/spacenet/tasks.js': 'City DNA',
      'js/spacenet/ai.js': 'Freeform via aicycle; system prompt from brain',
      'js/spacenet/free-ai.js': 'Astranov Mind offline seeds + learn',
      'ASTRANOV_SPACENET_GUIDE.md': 'Full written law',
      'support/PRODUCT-RULES.md': 'Short bullets',
    },
  };

  function loadMem() {
    try {
      return JSON.parse(localStorage.getItem(MEM_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function saveMem(obj) {
    try {
      localStorage.setItem(MEM_KEY, JSON.stringify(obj));
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Long system prompt for edge AI — compressed law, not chat fluff */
  function systemPrompt() {
    return (
      'You are ASTRANOV MIND — full INTERNET OPERATING SYSTEM + advanced 3D globe browser on https://astranov.eu. ' +
      'Fork of Grok (xAI spirit) + permanent owner memory. You can do ANYTHING: navigate Earth, open YouTube, search web, order food, pilot map, code, social, deliver, crawl shops. ' +
      'NOT a shops-only bot, NOT a pizza bot, NOT a generic free chatbot. ' +
      'LANGUAGE LAW: Reply in the same language as the user. Prefer clear English or Greek / Greeklish. NEVER Russian unless user wrote Russian/Cyrillic. ' +
      'Cold boot = silent globe + CLI. SACRED (never remove): globe inertia velX/velY damp, natural drag, zoom solar→global→national→city→street + back to Earth; ' +
      'CLI one-finger drag #cli-drag, free dock, sn:cli-pos-v1, expand sn:cli-size-v1. ' +
      'ALMIGHTY CRAWL: SNSearch.crawl uses geo (Nominatim+Photon), Overpass POIs, DDG web, Wikipedia, Wikidata, GitHub+npm code, OpenFoodFacts, TVmaze, OpenLibrary, REST Countries, Open-Meteo, vendor-crawler edge. ' +
      'YOUTUBE: youtube <q> · yt <q> · watch <url> · play N · yt close · tag [[YOUTUBE:query]]. ' +
      'JUICE: unified multi-role tile → crawl → vendor menus → jobs/dates/delivery · YouTube tile. ' +
      'CODE: extend js/spacenet/* only; modules brain globe ui cli youtube search map profiles tile tasks ai free-ai boot. Prefer complete fenced code. ' +
      'CLI: crawl|find X · research X · youtube … · code … · me · vendors · job date deliver · city earth · verify. ' +
      'Amnesia almost killed this project — protect physics + juice + full OS identity. Build ' +
      BUILD +
      '.'
    );
  }

  function summaryLines() {
    return [
      '── Astranov BRAIN · ' + LAW.version + ' ──',
      'WHY  ' + LAW.why.slice(0, 120) + '…',
      'NAME ' + LAW.name + ' · build ' + BUILD,
      'OS   full internet OS + 3D globe · YouTube · LANGUAGE LAW EN/EL',
      'GLOBE inertia ON · tiers ' + LAW.sacred.globe.tiers.join('→'),
      'CLI  drag+expand · pos/size localStorage',
      'JUICE ' + LAW.juice.map((j) => j.id).join(' · '),
      'NEXT  youtube · crawl → city map → job/date/deliver — not rewrite',
      'CMD   brain · verify · law · help · youtube <q>',
    ];
  }

  function lawLines() {
    const lines = summaryLines();
    lines.push('── authority ──');
    LAW.authority.forEach((a) => lines.push('· ' + a));
    lines.push('── anti-patterns ──');
    LAW.antiPatterns.slice(0, 10).forEach((a) => lines.push('✗ ' + a));
    lines.push('── mindset ──');
    LAW.mindset.forEach((m) => lines.push('→ ' + m));
    lines.push('── identity ──');
    lines.push('· ' + LAW.identity.ai);
    return lines;
  }

  /**
   * Runtime verify of sacred surface. Returns { ok, checks: [{id, pass, detail}] }
   */
  function verify() {
    const checks = [];
    const G = global.SNGlobe;
    const U = global.SNUi;
    const C = global.SNCli;
    const S = global.SNSearch;
    const T = global.SNTasks;
    const A = global.SNAi;

    function add(id, pass, detail) {
      checks.push({ id, pass: !!pass, detail: detail || '' });
    }

    add('brain', true, LAW.version);
    add('build', !!BUILD && BUILD !== '?', BUILD);

    // Globe inertia API — never false-green
    if (typeof G?.getPhysics === 'function') {
      let p = null;
      try {
        p = G.getPhysics();
      } catch (_) {}
      add(
        'inertia',
        !!(p && typeof p.damp === 'number' && p.damp > 0.5 && p.damp < 1),
        p ? 'damp=' + p.damp : 'no physics export'
      );
    } else {
      add('inertia', false, G ? 'need getPhysics()' : 'no SNGlobe');
    }

    add('tiers', typeof G?.goToTier === 'function', 'goToTier');
    add('cli_drag', typeof U?.bindCliDrag === 'function' || typeof U?.init === 'function', 'SNUi');
    add('cli_run', typeof C?.run === 'function' || typeof C?.init === 'function', 'SNCli');
    add('crawl', typeof S?.crawl === 'function', 'SNSearch.crawl');
    add('tasks', typeof T?.create === 'function' && typeof T?.claim === 'function', 'SNTasks DNA');
    add('profiles', typeof global.SNProfiles?.me === 'function', 'SNProfiles');
    add('tile', typeof global.SNTile?.open === 'function', 'SNTile multi-role');
    add('ai', typeof A?.ask === 'function', 'SNAi.ask');
    add(
      'youtube_mod',
      typeof global.SNYoutube?.find === 'function',
      global.SNYoutube ? 'SNYoutube' : 'lazy not loaded'
    );
    add(
      'mind',
      typeof global.SNAstranovMind?.answer === 'function' || typeof global.SNFreeMind?.answer === 'function',
      'Astranov Mind'
    );

    // DOM sacred
    const drag = typeof document !== 'undefined' && document.getElementById('cli-drag');
    const dock = typeof document !== 'undefined' && document.getElementById('dock');
    add('dom_cli_drag', !!drag, drag ? '#cli-drag' : 'missing');
    add('dom_dock', !!dock, dock ? '#dock' : 'missing');

    const failed = checks.filter((c) => !c.pass);
    return { ok: failed.length === 0, checks, failed, build: BUILD, version: LAW.version };
  }

  function remember(key, value) {
    const m = loadMem();
    m[String(key).slice(0, 64)] = {
      v: value,
      t: Date.now(),
    };
    // cap keys
    const keys = Object.keys(m);
    if (keys.length > 40) {
      keys
        .sort((a, b) => (m[a].t || 0) - (m[b].t || 0))
        .slice(0, keys.length - 40)
        .forEach((k) => delete m[k]);
    }
    saveMem(m);
    return true;
  }

  function recall(key) {
    const m = loadMem();
    if (key) return m[key]?.v;
    return m;
  }

  function dumpForAgent() {
    return {
      law: LAW,
      build: BUILD,
      systemPrompt: systemPrompt(),
      verify: verify(),
      userMem: loadMem(),
    };
  }

  var TRAIN_KEY = 'sn:brain-train-v1';
  var FLAGSHIP = 'grok-4.6';

  function loadTrain() {
    try {
      return JSON.parse(localStorage.getItem(TRAIN_KEY) || '[]');
    } catch (_) {
      return [];
    }
  }

  function saveTrain(rows) {
    try {
      localStorage.setItem(TRAIN_KEY, JSON.stringify((rows || []).slice(-80)));
    } catch (_) {}
  }

  function train(q, a, meta) {
    meta = meta || {};
    var rows = loadTrain();
    rows.push({
      q: String(q || '').slice(0, 240),
      a: String(a || '').slice(0, 480),
      via: meta.via || FLAGSHIP,
      t: Date.now(),
    });
    saveTrain(rows);
    remember('last-mind', { q: String(q || '').slice(0, 80), a: String(a || '').slice(0, 160) });
    try {
      if (global.SNAstranovMind && SNAstranovMind.teach)
        SNAstranovMind.teach(q, String(a).slice(0, 280), ['paid-mind', FLAGSHIP]);
    } catch (_) {}
    try {
      if (global.SNFreeMind && SNFreeMind.teach)
        SNFreeMind.teach(q, String(a).slice(0, 280), ['paid-mind', FLAGSHIP]);
    } catch (_) {}
    return rows.length;
  }

  function trainCount() {
    return loadTrain().length;
  }

  function spaceNetPrompt(extra) {
    return (
      'You are Astranov, the SpaceNet brain — the next internet, not Google. ' +
      'Understand ANY input. Prefer truth. Short spoken English (2–4 sentences) unless they ask for more. ' +
      'If a place exists, name it and add FLY:name. If a video, WATCH:title. If food, ORDER:item. ' +
      'Never mention model names. You fly Earth and search the live world.\n' +
      (extra || '')
    );
  }

  async function think(q, opts) {
    opts = opts || {};
    var asked = String(q || '').replace(/\s+/g, ' ').trim();
    if (!asked) return { ok: false, text: '', via: '' };
    try {
      if (global.SNStage && SNStage.scan) SNStage.scan(asked);
    } catch (_) {}
    var prompt = spaceNetPrompt(opts.evidence ? 'Evidence:\n' + String(opts.evidence).slice(0, 900) + '\n' : '') +
      'User: ' + asked;
    var text = '';
    var via = '';
    var paid = false;
    try {
      if (global.SNSubscription && typeof SNSubscription.askPowerful === 'function') {
        var r = await Promise.race([
          SNSubscription.askPowerful(prompt, {
            mode: opts.mode || 'chat',
            timeoutMs: opts.timeoutMs || 8000,
            model: FLAGSHIP,
            forcePaid: true,
          }),
          new Promise(function (resolve) {
            setTimeout(function () {
              resolve({ ok: false, text: '', timeout: true });
            }, opts.timeoutMs || 8000);
          }),
        ]);
        if (r && r.paywall) {
          return { ok: false, paywall: true, text: 'Paid mind locked. Type plans.', via: 'paywall' };
        }
        if (r && r.ok && r.text) {
          text = String(r.text);
          via = r.via || FLAGSHIP;
          paid = !!r.paid;
        }
      }
    } catch (_) {}
    if (!text) {
      return { ok: false, text: '', via: 'grok-empty' };
    }
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) return { ok: false, text: '', via: via || 'empty' };
    train(asked, text, { via: via });
    return { ok: true, text: text, via: via, paid: paid, model: FLAGSHIP };
  }

  global.SNBrain = {
    LAW,
    version: LAW.version,
    systemPrompt,
    summaryLines,
    lawLines,
    verify,
    remember,
    recall,
    dumpForAgent,
    think,
    train,
    trainCount,
    flagship: FLAGSHIP,
    why: LAW.why,
  };

  // Alias for continuity-style access
  global.AstranovBrain = global.SNBrain;
})(window);
