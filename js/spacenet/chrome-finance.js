/* Astranov investor finance · 20260823183000-finance
 * Type "budget" or "finance". Preview envelopes, not quotes, not funded.
 * Does NOT restyle CLI placeholders. Does NOT open Leaflet.
 */
(function (global) {
  'use strict';
  var BUILD = '20260823223000-invlive';
  if (global.__SN_FINANCE === BUILD) return;
  global.__SN_FINANCE = BUILD;

  /* 2026 Greece island rates used:
   * new build ~€2,200–2,800/m² · heavy village restore ~€900–1,400/m²
   * VAT 24% shown separate. Land/cadastral NOT in CAPEX unless noted.
   * 15% contingency sits inside each package.
   */
  var MODEL = {
    ops: 40,
    owner: 30,
    village: 30,
    note: 'Operating surplus only. Title of each restored house stays with the owner. Astranov does not buy the village. Oversustainable: restore + produce, not offset.'
  };

  var PACKAGES = [
    {
      id: 'motorhouses',
      name: 'Glass motor-houses',
      place: 'Kallithea, Rhodes',
      pin: 'kallithea',
      phase: 1,
      capex: 3120,
      unit: '12 houses · 60 m² each',
      lines: [
        ['Chassis, wheels, jacks, batteries', 540],
        ['Glass/steel envelope + solar roof', 1440],
        ['Interior fit-out', 480],
        ['Stone pads + water/power hook', 300],
        ['Soft costs + 15% contingency', 360]
      ],
      note: 'Movable pavilions on terraces. Not poured villas. Full 1.1 km designed lake is NOT in this number.'
    },
    {
      id: 'kallithea-commons',
      name: 'Kallithea phase-1 landscape',
      place: 'Kallithea HQ terraces',
      pin: 'kallithea',
      phase: 1,
      capex: 890,
      unit: 'pads, microgrid, small water garden',
      lines: [
        ['Terrace pads + paths', 220],
        ['Solar microgrid + storage', 280],
        ['Retention pond / water garden', 190],
        ['Olives, greywater, soft costs', 200]
      ],
      note: 'Does not excavate the 1.1 × 0.75 km designed lake. That lake is a later EIA package.'
    },
    {
      id: 'lake',
      name: 'Designed lake (optional)',
      place: 'Kallithea topo study',
      pin: 'kallithea',
      phase: 2,
      capex: 12000,
      unit: '~1.1 km × 0.75 km reservoir',
      lines: [
        ['Earthworks / liner / shores', 8200],
        ['Islets, edge, EIA, contingency', 3800]
      ],
      note: 'NOT in Phase 1. Needs environmental permit. Shown so the topo study is costed, not hidden.'
    },
    {
      id: 'koskinou-bar',
      name: 'Koskinou wood oven bar',
      place: 'Koskinou junction',
      pin: 'koskinou',
      phase: 1,
      capex: 340,
      unit: '~110 m² tavern + oven',
      lines: [
        ['Fit-out + wood oven + hood', 210],
        ['Kitchen equipment', 70],
        ['Licenses, furniture, contingency', 60]
      ],
      note: 'Hospitality in the existing village. Property acquisition separate if we do not already hold the unit.'
    },
    {
      id: 'bodega',
      name: 'Fanes Bodega',
      place: 'Fanes',
      pin: 'bodega',
      phase: 1,
      capex: 280,
      unit: 'ground-floor kitchen bar + cellar',
      lines: [
        ['Fit-out + cellar', 170],
        ['Kitchen + terrace', 70],
        ['Soft + contingency', 40]
      ],
      note: 'Ground-floor commerce in the restored village model.'
    },
    {
      id: 'house-art',
      name: 'House of Art',
      place: 'Koskinou',
      pin: 'house-art',
      phase: 1,
      capex: 560,
      unit: '3-storey restore ~280 m²',
      lines: [
        ['Heavy restoration €1,200/m²', 336],
        ['Roof pergola + jacuzzi', 70],
        ['Tavern equipment', 80],
        ['Soft + contingency', 74]
      ],
      note: 'Restore an existing village house. Acquisition not in CAPEX.'
    },
    {
      id: 'fanes-restore',
      name: 'Fanes village restoration',
      place: 'Fanes, Rhodes',
      pin: 'fanes',
      phase: 1,
      capex: 1920,
      unit: '12 abandoned houses + commons',
      lines: [
        ['12 houses × ~€105k restore', 1260],
        ['Square, water, solar, waste', 320],
        ['2 workshops / taverns', 220],
        ['Inventory, permits, contingency', 120]
      ],
      note: 'Owners keep title. We fund the restoration. Village is under-occupied, not empty.'
    },
    {
      id: 'koskinou-restore',
      name: 'Koskinou village restoration',
      place: 'Koskinou, Rhodes',
      pin: 'koskinou',
      phase: 1,
      capex: 1640,
      unit: '10 houses + painted lanes',
      lines: [
        ['10 houses restore', 1050],
        ['Lanes, lighting, water', 280],
        ['Commons + contingency', 310]
      ],
      note: 'Working village with empty stock. Restore, do not replace.'
    },
    {
      id: 'kallithea-restore',
      name: 'Kallithea village restoration',
      place: 'Kallithea, Rhodes',
      pin: 'kallithea',
      phase: 1,
      capex: 1720,
      unit: '10 houses + coastal access',
      lines: [
        ['10 houses restore', 1100],
        ['Paths, solar, greywater', 360],
        ['Soft + contingency', 260]
      ],
      note: 'Separate from the glass motor-houses. This is the existing settlement fabric.'
    },
    {
      id: 'lofts',
      name: 'DigiNomads lofts',
      place: 'Kallithea coast',
      pin: 'lofts',
      phase: 1,
      capex: 2880,
      unit: '14 × 70 m² live-work',
      lines: [
        ['14 lofts new-build island rate', 2250],
        ['Commons: kitchen, gym, roof', 280],
        ['Soft + contingency', 350]
      ],
      note: 'New live-work, not a hotel. Land not included.'
    },
    {
      id: 'villa',
      name: 'Rose Stone Villa',
      place: 'Kallithea',
      pin: 'villa',
      phase: 1,
      capex: 980,
      unit: '~280 m² + landscape',
      lines: [
        ['Build / restore', 720],
        ['Drive, fountain, kitchen', 140],
        ['Soft + contingency', 120]
      ],
      note: 'Single house. Plot not in CAPEX.'
    },
    {
      id: 'yachtclub',
      name: 'Petras Yacht Club',
      place: 'Petras, Sitia, Crete',
      pin: 'sitia',
      phase: 1,
      capex: 2650,
      unit: 'taverna + 8 seaview lofts',
      lines: [
        ['Taverna / club ~450 m²', 1080],
        ['8 lofts × 55 m²', 970],
        ['Kitchen, FF&E, jacuzzi', 280],
        ['Soft + contingency', 320]
      ],
      note: 'Coastal-road plot. Yacht guests via Sitia port. Land not included. Landscape kept.'
    },
    {
      id: 'rousa-restore',
      name: 'Rousa Eklisia restoration',
      place: 'Roussa Ekklisia, Sitia',
      pin: 'rousa',
      phase: 1,
      capex: 1480,
      unit: '12 houses + square + water',
      lines: [
        ['12 houses restore', 1140],
        ['Square, fountain, paths', 160],
        ['Microgrid + contingency', 180]
      ],
      note: 'Real inhabited mountain village. Restore empty stock. Do not invent a resort. Mano’s village.'
    },
    {
      id: 'lagokefalo-restore',
      name: 'Lagokefalo restoration',
      place: 'Kato Lagokefalo district',
      pin: 'lagokefalo',
      phase: 1,
      capex: 720,
      unit: '6 rural houses',
      lines: [
        ['6 houses restore', 540],
        ['Access, water, solar', 120],
        ['Contingency', 60]
      ],
      note: 'District siting next to Rousa. Not a cadastral deed.'
    },
    {
      id: 'agia-restore',
      name: 'Agia Fotia eco-stays',
      place: 'Agia Fotia, Sitia',
      pin: 'agia-fotia',
      phase: 1,
      capex: 860,
      unit: '4 inland eco-stays',
      lines: [
        ['4 restored / light-new stays', 620],
        ['Path, solar, waste (not on beach)', 140],
        ['Contingency', 100]
      ],
      note: 'Behind the coves, not on the sand. No beach hotel.'
    },
    {
      id: 'trypitos',
      name: 'Trypitos adjacent study',
      place: 'Sitia east coast',
      pin: 'trypitos',
      phase: 1,
      capex: 90,
      unit: 'siting + legal only',
      lines: [['Survey, legal, heritage buffer', 90]],
      note: '€0 construction on the Hellenistic excavation. Protected. Nearby plot only if heritage allows.'
    },
    {
      id: 'yacht',
      name: 'Astranov solar yacht',
      place: 'Mandraki home berth',
      pin: 'yacht',
      phase: 1,
      capex: 5500,
      unit: '~26 m hybrid superyacht',
      lines: [
        ['Hull + classic superstructure', 3200],
        ['Diesel-electric hybrid + batteries', 620],
        ['Flexible PV film all surfaces inc. hull', 280],
        ['Forward party sundeck fit', 180],
        ['Class, MCA, delivery, contingency', 1220]
      ],
      note: 'Looks like a classic navy yacht. PV is the skin, not a science exhibit. Not built. OPEX ~€350k/year (crew, berth, insurance) not in CAPEX.'
    },
    {
      id: 'brothers',
      name: 'Brothers Island pontoon',
      place: 'Alimia candidate',
      pin: 'brothers',
      phase: 2,
      capex: 1600,
      unit: '20-berth modest pontoon',
      lines: [
        ['Pontoon + utilities', 1280],
        ['EIA / permit / contingency', 320]
      ],
      note: 'NOT PERMITTED. Not in Phase 1. Siting study only.'
    }
  ];

  var PHOTOS = {
    motorhouses: '/media/projects/kallithea/02.jpg',
    'kallithea-commons': '/media/projects/kallithea/01.jpg',
    lake: '/media/projects/kallithea/00-topo.svg',
    'koskinou-bar': '/media/projects/koskinou/00.jpg',
    bodega: '/media/projects/bodega/00.jpg',
    'house-art': '/media/projects/house-art/00.jpg',
    'fanes-restore': '/media/projects/fanes/00.jpg',
    'koskinou-restore': '/media/projects/koskinou/01.jpg',
    'kallithea-restore': '/media/projects/kallithea/13.jpg',
    lofts: '/media/projects/lofts/00.jpg',
    villa: '/media/projects/villa/00.jpg',
    yachtclub: '/media/projects/sitia/00.jpg',
    'rousa-restore': '/media/projects/rousa/00.jpg',
    'lagokefalo-restore': '/media/projects/lagokefalo/00.jpg',
    'agia-restore': '/media/projects/agia-fotia/00.jpg',
    trypitos: '/media/projects/trypitos/00.jpg',
    yacht: '/media/projects/yacht/00.jpg',
    brothers: '/media/projects/brothers/00.jpg'
  };

  function logCli(msg, kind) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(msg, kind || 'ok');
    } catch (_) {}
  }

  function eur(k) {
    if (k >= 1000) return '€' + (k / 1000).toFixed(k % 1000 === 0 ? 1 : 2).replace(/\.0$/, '') + 'M';
    return '€' + k + 'k';
  }

  function sumPhase(n) {
    var t = 0;
    PACKAGES.forEach(function (p) {
      if (p.phase === n) t += p.capex;
    });
    return t;
  }

  function vat(k) {
    return Math.round(k * 0.24);
  }

  function injectCss() {
    if (document.getElementById('sn-fin-css')) return;
    var s = document.createElement('style');
    s.id = 'sn-fin-css';
    s.textContent =
      '#sn-fin{position:fixed;inset:0;z-index:122;display:none;align-items:flex-end;justify-content:center;background:rgba(2,6,14,.78)}' +
      '#sn-fin.open{display:flex}' +
      '#sn-fin-card{width:min(100vw,980px);max-height:min(94vh,980px);background:#0b1220;color:#eaf2ff;border-radius:18px 18px 0 0;overflow:hidden;display:flex;flex-direction:column}' +
      '#sn-fin-head{padding:14px 16px 8px;border-bottom:1px solid rgba(180,220,255,.12)}' +
      '#sn-fin-head h2{margin:0 0 4px;font:700 18px/1.2 Inter,system-ui,sans-serif}' +
      '#sn-fin-head .sub{font:500 12px/1.4 Inter,system-ui,sans-serif;color:#9ec4ee}' +
      '#sn-fin-tabs{display:flex;gap:6px;padding:8px 16px;overflow-x:auto}' +
      '#sn-fin-tabs button{height:34px;padding:0 12px;border-radius:999px;border:1px solid rgba(126,200,255,.3);background:transparent;color:#c5d6ea;font:650 11px/1 Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}' +
      '#sn-fin-tabs button.on{background:rgba(20,50,80,.7);color:#fff;border-color:#7ec8ff}' +
      '#sn-fin-body{padding:8px 16px 18px;overflow:auto;font:400 13px/1.45 Inter,system-ui,sans-serif}' +
      '#sn-fin-body table{width:100%;border-collapse:collapse;margin:8px 0 14px}' +
      '#sn-fin-body th,#sn-fin-body td{text-align:left;padding:7px 6px;border-bottom:1px solid rgba(180,220,255,.1)}' +
      '#sn-fin-body th{color:#9ec4ee;font:650 10px/1 Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase}' +
      '#sn-fin-body td.n{text-align:right;font-variant-numeric:tabular-nums;color:#e8c36a}' +
      '#sn-fin-body td img{width:56px;height:38px;object-fit:cover;border-radius:6px;display:block;background:#05080f}' +
      '#sn-fin-body .warn{color:#f3d48a;font:500 12px/1.4 Inter,system-ui,sans-serif}' +
      '#sn-fin-body .split{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}' +
      '#sn-fin-body .pill{flex:1;min-width:140px;border:1px solid rgba(232,195,106,.35);border-radius:12px;padding:10px}' +
      '#sn-fin-body .pill b{display:block;font-size:20px;color:#e8c36a}' +
      '#sn-fin-x{position:absolute;top:10px;right:10px;width:40px;height:40px;border-radius:999px;border:1px solid rgba(126,200,255,.4);background:rgba(20,40,70,.6);color:#fff;cursor:pointer}' +
      '#sn-fin-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}' +
      '#sn-fin-acts button{height:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(126,200,255,.4);background:rgba(20,40,70,.6);color:#e8f2ff;font:650 12px/1 Inter,system-ui,sans-serif;cursor:pointer}' +
      '@media(min-width:720px){#sn-fin{align-items:center;padding:24px}#sn-fin-card{border-radius:18px;position:relative}}';
    document.head.appendChild(s);
  }

  var tab = 'model';
  var focus = null;

  function el() {
    var m = document.getElementById('sn-fin');
    if (m) return m;
    injectCss();
    m = document.createElement('div');
    m.id = 'sn-fin';
    m.innerHTML =
      '<div id="sn-fin-card" role="dialog" aria-modal="true">' +
      '<button type="button" id="sn-fin-x" aria-label="Close">×</button>' +
      '<div id="sn-fin-head"><h2>Astranov · investor budget</h2>' +
      '<div class="sub">2026 island-rate envelopes · EUR · not quotes · not funded · land usually excluded</div></div>' +
      '<div id="sn-fin-tabs"></div><div id="sn-fin-body"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) {
      if (e.target === m) close();
    });
    document.getElementById('sn-fin-x').onclick = close;
    return m;
  }

  function tabs() {
    var host = document.getElementById('sn-fin-tabs');
    host.innerHTML = '';
    var items = [
      ['model', 'Model'],
      ['over', 'Oversustain + Coin'],
      ['phase1', 'Phase 1'],
      ['restore', 'Village restore'],
      ['assets', 'Yacht + houses'],
      ['later', 'Not in Phase 1']
    ];
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = it[1];
      if (tab === it[0]) b.className = 'on';
      b.onclick = function () {
        tab = it[0];
        render();
      };
      host.appendChild(b);
    });
  }

  function tableFor(list) {
    var html =
      '<table><thead><tr><th></th><th>Package</th><th>Place</th><th>What</th><th>CAPEX</th></tr></thead><tbody>';
    var tot = 0;
    list.forEach(function (p) {
      tot += p.capex;
      var photo = p.photo || PHOTOS[p.id] || '/icon.png';
      html +=
        '<tr data-id="' +
        p.id +
        '"><td><img src="' +
        photo +
        '" alt=""></td><td>' +
        p.name +
        '</td><td>' +
        p.place +
        '</td><td>' +
        p.unit +
        '</td><td class="n">' +
        eur(p.capex) +
        '</td></tr>';
    });
    html +=
      '<tr><td colspan="4"><b>Subtotal net</b></td><td class="n"><b>' +
      eur(tot) +
      '</b></td></tr>' +
      '<tr><td colspan="4">VAT 24% (construction)</td><td class="n">' +
      eur(vat(tot)) +
      '</td></tr>' +
      '<tr><td colspan="4"><b>Total if VAT applies in full</b></td><td class="n"><b>' +
      eur(tot + vat(tot)) +
      '</b></td></tr></tbody></table>';
    return html;
  }

  function detail(p) {
    var rows = p.lines
      .map(function (l) {
        return '<tr><td colspan="3">' + l[0] + '</td><td class="n">' + eur(l[1]) + '</td></tr>';
      })
      .join('');
    return (
      '<p class="warn">' +
      p.note +
      '</p><table><tbody>' +
      rows +
      '<tr><td colspan="3"><b>' +
      p.name +
      '</b></td><td class="n"><b>' +
      eur(p.capex) +
      '</b></td></tr></tbody></table>' +
      '<div id="sn-fin-acts"><button type="button" data-fly="' +
      p.pin +
      '">Fly to ' +
      p.place +
      '</button></div>'
    );
  }

  function render() {
    tabs();
    var body = document.getElementById('sn-fin-body');
    var p1 = PACKAGES.filter(function (p) {
      return p.phase === 1;
    });
    var p2 = PACKAGES.filter(function (p) {
      return p.phase === 2;
    });
    var restore = PACKAGES.filter(function (p) {
      return /restore|eco-stays/.test(p.id + p.name);
    });
    var assets = PACKAGES.filter(function (p) {
      return /motorhouses|yacht$|yachtclub|lofts|villa|koskinou-bar|bodega|house-art/.test(p.id);
    });
    if (tab === 'model') {
      body.innerHTML =
        '<p>These villages are not empty land. They are <b>under-occupied, under-maintained settlements</b>. The work is restoration into sustainable eco-touristic villages — owners stay on title.</p>' +
        '<div class="split">' +
        '<div class="pill"><b>' +
        MODEL.ops +
        '%</b>Operations · local wages, energy, food, maintenance</div>' +
        '<div class="pill"><b>' +
        MODEL.owner +
        '%</b>Owner yield · the house remains theirs</div>' +
        '<div class="pill"><b>' +
        MODEL.village +
        '%</b>Village company · next restoration + commons</div></div>' +
        '<p class="warn">' +
        MODEL.note +
        '</p>' +
        '<p>Phase 1 net CAPEX <b>' +
        eur(sumPhase(1)) +
        '</b> · SpaceNet <b>€7.00M</b> · <b>to complete SpaceNet + Phase 1 = €32.63M</b> remaining (gathered €0). VAT on construction if fully applied → <b>€38.78M</b>.</p>' +
        '<p>Held out of Phase 1: designed lake ' +
        eur(12000) +
        ' · Brothers pontoon ' +
        eur(1600) +
        ' (not permitted).</p>' +
        '<p>Rates: 2026 island new-build ~€2.2–2.8k/m² · heavy village restore ~€0.9–1.4k/m². 15% contingency inside packages. Land usually extra.</p>' +
        '<p><a href="https://investors.astranov.eu" style="color:#7ec8ff">investors.astranov.eu</a> · <a href="https://exchange.astranov.eu" style="color:#7ec8ff">exchange.astranov.eu</a></p>' +
        '<p>SpaceNet Presence · any client subdomain <b>€330 / year</b> · globe behind, real pins, profile + picture + preview.</p>';
    } else if (tab === 'over') {
      body.innerHTML =
        '<p><b>Oversustainable</b> is the law on every pin. Top technology is not used to “pollute less.” It is used to <b>not pollute</b>, to <b>restore the planet</b> (land, water, houses, olives), and to <b>produce goods and services</b> — stays, food, energy, work — on top of money.</p>' +
        '<div class="split">' +
        '<div class="pill"><b>0</b>Pollution as default</div>' +
        '<div class="pill"><b>+</b>Restore what was sliding to ruin</div>' +
        '<div class="pill"><b>×</b>Produce real output</div></div>' +
        '<p><b>Astranov Coin</b> is everyday money: <b>1 AVC = 1 EUR</b>. Live work-mint at <a href="https://coin.astranov.eu" style="color:#7ec8ff">coin.astranov.eu</a>. Not legal tender. Not a bank print.</p>' +
        '<p>The <b>Astranov Share (ASH)</b> lives on the <a href="https://exchange.astranov.eu" style="color:#7ec8ff">Astranov SpaceNet Stock Exchange</a>. Indicative designed NAV <b>50.00 AVC</b> · <b>1,000,000 shares</b> · designed value <b>€50M</b>.</p>' +
        '<p>Stack: Phase 1 projects €25.63M · Phase 2 designed €13.60M · SpaceNet €7M · Astranov brand €3.77M. Estimate, not an appraisal. Coin stays 1=1 EUR.</p>';
    } else if (tab === 'phase1') {
      body.innerHTML = tableFor(p1) + '<p class="warn">Phase 1 is the permitted-path envelope. Lake and Brothers pontoon are out.</p>';
    } else if (tab === 'restore') {
      body.innerHTML =
        '<p>Fanes, Koskinou, Kallithea (Rhodes) · Rousa Eklisia, Lagokefalo, Agia Fotia (Sitia). Petras is the yacht club, not a whole-village buy. Trypitos ruins are not touched.</p>' +
        tableFor(restore);
    } else if (tab === 'assets') {
      body.innerHTML = tableFor(assets);
    } else {
      body.innerHTML =
        '<p class="warn">Do not pitch these as funded or permitted.</p>' + tableFor(p2);
    }
    if (focus) {
      var hit = null;
      PACKAGES.forEach(function (p) {
        if (p.id === focus || p.pin === focus) hit = p;
      });
      if (hit) body.innerHTML += '<h3 style="margin:12px 0 4px">' + hit.name + '</h3>' + detail(hit);
    }
    body.querySelectorAll('[data-fly]').forEach(function (b) {
      b.onclick = function () {
        try {
          if (global.SNProjects && SNProjects.open) SNProjects.open(b.getAttribute('data-fly'), true);
        } catch (_) {}
      };
    });
    body.querySelectorAll('tr[data-id]').forEach(function (tr) {
      tr.style.cursor = 'pointer';
      tr.onclick = function () {
        var id = tr.getAttribute('data-id');
        focus = id;
        var hit = null;
        PACKAGES.forEach(function (p) {
          if (p.id === id || p.pin === id) hit = p;
        });
        try {
          if (hit && hit.pin && global.SNProjects && SNProjects.open) {
            close();
            SNProjects.open(hit.pin, true);
            return;
          }
        } catch (_) {}
        render();
      };
    });
  }

  function open(which) {
    focus = which || null;
    if (which === 'restore') tab = 'restore';
    else if (which === 'over' || which === 'coin' || which === 'oversustain') tab = 'over';
    else if (which === 'later' || which === 'lake' || which === 'brothers') tab = 'later';
    else if (which) tab = 'phase1';
    else tab = 'model';
    el().classList.add('open');
    render();
    logCli('To complete SpaceNet + Phase 1 · €32.63M remaining · gathered €0', 'ok');
  }

  function close() {
    var m = document.getElementById('sn-fin');
    if (m) m.classList.remove('open');
  }

  function handle(raw) {
    var t = String(raw || '').trim();
    var low = t.toLowerCase();
    if (!low) return false;
    if (
      /^(budget|finance|presentation|capex|οικονομικ|how much|remaining|to complete|raise|investors?)$/.test(low) ||
      /how much|need to complete|remaining to gather|complete spacenet/.test(low)
    ) {
      open(null);
      return true;
    }
    if (/oversustain|hyper.?planet|astranov coin|^coin$|^avc$|super currency/.test(low)) {
      tab = 'over';
      open(null);
      return true;
    }
    if (/^(exchange|shares?|stock|ash)$/.test(low) || (low.indexOf('share') >= 0 && /astranov|stock/.test(low))) {
      try {
        location.href = 'https://exchange.astranov.eu';
      } catch (_) {}
      return true;
    }
    if (/budget|finance|capex/.test(low) && /phase\s*1|phase1/.test(low)) {
      tab = 'phase1';
      open(null);
      return true;
    }
    if (/budget|finance|restore|restoration/.test(low) && /village/.test(low)) {
      open('restore');
      return true;
    }
    var i;
    for (i = 0; i < PACKAGES.length; i++) {
      var p = PACKAGES[i];
      if (
        (low.indexOf('budget') >= 0 || low.indexOf('finance') >= 0 || low.indexOf('cost') >= 0) &&
        (low.indexOf(p.id) >= 0 || low.indexOf(p.pin) >= 0 || low.indexOf(p.name.toLowerCase()) >= 0)
      ) {
        open(p.id);
        return true;
      }
    }
    if (/budget|finance/.test(low) && /yacht/.test(low) && /club/.test(low)) {
      open('yachtclub');
      return true;
    }
    if (/budget|finance/.test(low) && /yacht|solar/.test(low)) {
      open('yacht');
      return true;
    }
    if (/budget|finance/.test(low) && /motor|glass/.test(low)) {
      open('motorhouses');
      return true;
    }
    return false;
  }

  function interceptCli() {
    var form = document.getElementById('cli-form') || document.querySelector('#panel form');
    if (form && !form.__snFin) {
      form.__snFin = 1;
      form.addEventListener(
        'submit',
        function (e) {
          var inp = document.getElementById('cli-in') || document.getElementById('stc-cmd-in');
          var v = inp ? inp.value : '';
          if (handle(v)) {
            e.preventDefault();
            e.stopPropagation();
            if (inp) inp.value = '';
          }
        },
        true
      );
    }
    var top = document.getElementById('stc-cmd-form');
    if (top && !top.__snFin) {
      top.__snFin = 1;
      top.addEventListener(
        'submit',
        function (e) {
          var inp = document.getElementById('stc-cmd-in');
          var v = inp ? inp.value : '';
          if (handle(v)) {
            e.preventDefault();
            e.stopPropagation();
            if (inp) inp.value = '';
          }
        },
        true
      );
    }
  }

  function hookProjectModal() {
    var acts = document.getElementById('sn-proj-acts');
    if (!acts || acts.querySelector('#sn-proj-budget')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'sn-proj-budget';
    b.textContent = 'Budget';
    b.onclick = function () {
      var id = global.SNProjects && SNProjects.openId ? SNProjects.openId() : null;
      open(id || null);
    };
    acts.appendChild(b);
  }

  function boot() {
    interceptCli();
    hookProjectModal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setInterval(function () {
    interceptCli();
    hookProjectModal();
  }, 2500);

  global.SNFinance = {
    open: open,
    close: close,
    handle: handle,
    packages: PACKAGES,
    phase1: sumPhase(1),
    build: BUILD
  };
})(typeof window !== 'undefined' ? window : globalThis);
