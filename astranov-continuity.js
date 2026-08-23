/** Astranov / SpaceNet continuity — machine contract. SPECS.md is sole law. */
const AstranovContinuity = {
  version: '20260812184500-orbit-wire',
  updated: '2026-08-12',
  live: 'https://astranov.eu',
  repo: 'notisastranov/astranov.eu',
  ownerEmail: 'notisastranov@gmail.com',
  specs: 'SPECS.md',
  legacySpecs: 'support/SPECS-LEGACY-before-rebuild-20260730.md',

  /** Naming: SpaceNet = system/grid; Astranov = AI + public face ASTRANOV */
  naming: {
    system: 'SpaceNet',
    systemRole: 'internal OS + pilot fly grid + module path /js/spacenet/* + currency S/SpaceNets',
    grid: 'SPACENET (window.SPACENET)',
    publicBrand: 'ASTRANOV',
    domain: 'astranov.eu',
    ai: 'Astranov',
    aiMind: 'Astranov Mind',
    aiListen: 'human short sentences (no robot LISTENING spam)',
    currency: 'S / SpaceNets',
    forbiddenAiNames: ['SpaceNet', 'Grok', 'ChatGPT'],
  },

  p0: 'spartan-coding',
  p0d: 'zero-dummy-absolute',
  p0Coord: 'multi-user-task-coordination',
  shipGate: 'live path green OR honest not-verified; push alone is not ship',
  neverMakeOwnerRestateSpecs: true,
  emailSupportOnFalseShip: true,

  ownerVerified: {
    '2026-07-30': [
      'OV-01 GLOBAL Earth in space boot',
      'OV-02 no training sim / Rodos default',
      'OV-03 no map-corner Layers under money HUD',
      'OV-04 CLI text only · multi-tile on map',
      'OV-05 home ASTRANOV only',
      'OV-06 AI = Astranov',
      'OV-07 no junk free-mind',
      'OV-08 auth astranov.eu not supabase project face',
      'OV-09 splash ASTRANOV + horizontal blue loader',
      'OV-10 polar axis spin',
      'OV-11 first delivery · donate on',
      'OV-12 false ship → email + escalation',
      'OV-13 naming SpaceNet system / Astranov AI',
      'OV-14 SPECS thin rebuild',
    ],
    '2026-07-31': [
      'OV-15 CLI top ribbon Locate·User·Add·Layers·AI·Send · no burger · tools on ASTRANOV home',
      'OV-16 Ribbon: only ➕ + Layers expand · User=login/profile · ASTRANOV home=device harvest Main/Secondary/RAID',
    ],
  },

  coordination: {
    module: 'js/spacenet/tasks.js',
    apis: ['createPlan', 'assignPlan', 'planStatus', 'listPlans', 'isCoordIntent'],
    cli: ['coord <text>', 'assign …', 'plan list', 'plan status', 'claim', 'task list', 'task map'],
    rules: [
      'parse natural multi-role intent → linked tasks with planId',
      'nearest real profiles only — no dummy users',
      'driver tasks may dependOn vendor prep',
      'one human summary line on CLI — no spam',
      'pulse map + showTasks when map open',
    ],
  },

  spacenet: {
    name: 'SPACENET',
    role: 'pilot fly grid net (internal SpaceNet system)',
    file: 'js/spacenet/spacenet-grid.js',
    global: 'window.SPACENET',
    path: 'GLOBAL → NATIONAL → REGIONAL → CITY',
    boot: 'GLOBAL Earth in space · city closed',
    singleTap: 'deeper same place; new place → GLOBAL',
    doubleTap: 'out toward SOLAR',
    drag: 'Y polar spin · X tilt · no Z clock',
  },

  surface: {
    chrome: ['radar', 'ASTRANOV home (device harvest technical)', 'miner S HUD'],
    cli: 'top ribbon 6 shortcuts + log + input',
    cliRibbon: ['locate', 'user', 'add', 'layers', 'AI', 'send'],
    cliForbidden: ['feed chip tiles', 'menu/cart/order ribbon flood', 'burger chrome', 'almighty crawl spam'],
    tools: 'ASTRANOV home · CLI ribbon · money HUD · map multi-tile · typed CLI',
    multiTile: 'map overlay only · peek first then expand',
    finance: 'money HUD only',
    noBurger: true,
  },

  ai: {
    name: 'Astranov',
    mind: 'Astranov Mind',
    freeFirst: true,
    controlApp: true,
    noJunkFuzzy: true,
    hardIntentsFirst: ['coord', 'food', 'telemachos', 'navigate'],
  },

  auth: {
    face: 'astranov.eu / ASTRANOV',
    ban: '*.supabase.co as product identity',
    preferred: 'Google GIS + signInWithIdToken',
    customDomain: 'api.astranov.eu when live',
  },

  economy: {
    primary: 'S / SpaceNets',
    platformFee: '3% gross every order → vault',
    driverCut: '15% gross',
    meshDonate: 'SETI-style donate on → spare capacity → S',
  },

  firstLoop: {
    auto: 'first delivery',
    path: 'list shop → menu add → order me → drive on → deliver me',
    module: 'js/spacenet/market.js',
    onShellBoot: true,
  },

  ban: [
    'training-sim',
    'sim-task-train',
    'rodos-training-default',
    'cli-feed-chip-tiles',
    'cli-burger-chrome',
    'menu-cart-order-ribbon-flood',
    'ai-brand-spacenet',
    'dummy-npc-seeds',
    'marketplace-curfew',
    'full-screen-tile-on-badge-tap',
  ],

  zeroDummy: {
    sectorFill: 'SNCommerce.ensureSector (db → edge → overpass → crawl)',
    emptySector: 'honest empty + long-press create or fly',
    coordination: 'nearest real profiles only; self as driver only if alone',
  },
};

if (typeof window !== 'undefined') window.AstranovContinuity = AstranovContinuity;
if (typeof module !== 'undefined' && module.exports) module.exports = AstranovContinuity;

/* OWNER soft-load 20260812184500 — must run even if Vercel caches perf-lazy */
(function ownerSoftLoad() {
  if (typeof window === 'undefined' || window.__SN_OWNER_SOFTLOAD) return;
  window.__SN_OWNER_SOFTLOAD = 1;
  var B = '20260812184500';
  function load(name) {
    var s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = '/js/spacenet/' + name + '.js?v=' + B;
    s.onerror = function () {
      try {
        s.src = 'https://cdn.jsdelivr.net/gh/notisastranov/astranov.eu@main/js/spacenet/' + name + '.js?v=' + B;
      } catch (_) {}
    };
    (document.head || document.documentElement).appendChild(s);
  }
  function run() {
    ['chrome-marina-discipline', 'chrome-mind-bridge', 'agent-orbit'].forEach(load);
  }
  if (document.readyState === 'complete') setTimeout(run, 300);
  else if (typeof window !== 'undefined') {
    window.addEventListener('load', function () { setTimeout(run, 300); });
  }
  setTimeout(run, 1200);
  setTimeout(run, 3500);
})();
