/* Astranov investor projects · 20260823183000-finance
 * Real-location pills on SNGlobe. Type "projects". Carousel is preview, not built.
 * Does NOT restyle CLI placeholders. Does NOT open Leaflet.
 */
(function (global) {
  'use strict';
  var BUILD = '20260823200000-presence';
  if (global.__SN_PROJECTS === BUILD) return;
  global.__SN_PROJECTS = BUILD;

  var PROJECTS = [
    {
      id: 'kallithea',
      name: 'Kallithea Ecological Village',
      place: 'Kallithea, Rhodes · 36.387557°N 28.222533°E',
      lat: 36.387557,
      lng: 28.222533,
      color: '#14c3f3',
      status: 'Topo study · investor preview · not built',
      blurb:
        'Real HQ pin from the OS topographic study (SNVillage). Designed artificial lake ~1.1 km × 0.75 km, five islets (Olive, Reed, Stone, Cypress, Heron), olive ring and north terrace grove. Glass motor-houses: low glass pavilions on motorized chassis, parked on stone pads in the olives — movable, not poured villas. Lake and houses are design. GPS is real.',
      images: [
        '00-topo.svg',
        '01.jpg',
        '02.jpg',
        '03.jpg',
        '04.jpg',
        '05.jpg',
        '06.jpg',
        '07.jpg',
        '08.jpg',
        '09.jpg',
        '10.jpg',
        '11.jpg',
        '12.jpg',
        '13.jpg'
      ]
    },
    {
      id: 'koskinou',
      name: 'Koskinou Wood Oven Bar',
      place: 'Koskinou village, Rhodes',
      lat: 36.3871,
      lng: 28.2131,
      color: '#3aa0ff',
      status: 'Investor preview · not built',
      blurb: 'Open kitchen wood-oven bar on the triangular junction in historic Koskinou. Delivery scooters, live fire, local stone.',
      images: [
        '00.jpg', '01.jpg', '02.jpg', '03.jpg', '04.jpg',
        '05.jpg', '06.jpg', '07.jpg', '08.jpg', '09.jpg',
        '10.jpg', '11.jpg', '12.jpg', '13.jpg'
      ]
    },
    {
      id: 'bodega',
      name: 'Astranov Bodega',
      place: 'Fanes, Rhodes',
      lat: 36.3513,
      lng: 28.0328,
      color: '#e8c36a',
      status: 'Investor preview · not built',
      blurb: 'Ground-floor wood-oven kitchen bar and cellar in Fanes, Village of Colors. Yellow village doors, rooftop terrace.',
      images: [
        '00.jpg', '01.jpg', '02.jpg', '03.jpg', '04.jpg',
        '05.jpg', '06.jpg', '07.jpg', '08.jpg', '09.jpg',
        '10.jpg', '11.jpg', '12.jpg', '13.jpg'
      ]
    },
    {
      id: 'house-art',
      name: 'House of Art Wood Oven Bar',
      place: 'Koskinou village, Rhodes',
      lat: 36.3882,
      lng: 28.2118,
      color: '#d48cff',
      status: 'Investor preview · not built',
      blurb: 'Three-storey village house in Koskinou: tavern, wood oven, rooftop pergola and jacuzzi. Plot in the same village as the junction bar.',
      images: [
        '00.jpg', '01.jpg', '02.jpg', '03.jpg', '04.jpg',
        '05.jpg', '06.jpg', '07.jpg', '08.jpg', '09.jpg',
        '10.jpg', '11.jpg', '12.jpg', '13.jpg'
      ]
    },
    {
      id: 'fanes',
      name: 'Villages of Colors · Phase I',
      place: 'Fanes, Rhodes',
      lat: 36.3496,
      lng: 28.0264,
      color: '#5ad0a8',
      status: 'Investor preview · not built',
      blurb: 'Self-sufficient mixed-use village model inspired by Fanes. Ground-floor commerce, sea-view living, solar roofs. Owners keep the real estate.',
      images: [
        '00.jpg', '00-model.jpg', '01.jpg', '02.jpg', '03.jpg',
        '04.jpg', '05.jpg', '06.jpg', '07.jpg', '08.jpg',
        '09.jpg', '10.jpg', '11.jpg', '12.jpg'
      ]
    },
    {
      id: 'lofts',
      name: 'DigiNomads Lofts',
      place: 'Kallithea coast, Rhodes',
      lat: 36.3785,
      lng: 28.236,
      color: '#6ab6ff',
      status: 'Investor preview · not built',
      blurb: 'Live-work lofts on the Kallithea coast, Rhodes. Rooftop, shared kitchen, gym, work commons. Investor preview — not the Old Town pin from the marketing board.',
      images: [
        '00.jpg', '01.jpg', '02.jpg', '03.jpg', '04.jpg',
        '05.jpg', '06.jpg', '07.jpg', '08.jpg', '09.jpg',
        '10.jpg', '11.jpg', '12.jpg', '13.jpg'
      ]
    },
    {
      id: 'villa',
      name: 'Rose Stone Villa',
      place: 'Kallithea, Rhodes',
      lat: 36.3845,
      lng: 28.2195,
      color: '#c9a27a',
      status: 'Investor preview · plot reserved',
      blurb: 'Three-storey rose-stone villa on a Kallithea plot: loop drive, fountain, wood-fired kitchen. Investor preview.',
      images: [
        '00.jpg', '01.jpg', '02.jpg', '03.jpg', '04.jpg',
        '05.jpg', '06.jpg', '07.jpg', '08.jpg', '09.jpg',
        '10.jpg', '11.jpg', '12.jpg', '13.jpg'
      ]
    },
    {
      id: 'sitia',
      name: 'Astranov Yacht Club',
      place: 'Petras, Sitia, Crete',
      lat: 35.202,
      lng: 26.115,
      color: '#4cc4ff',
      status: 'Investor preview · not built',
      blurb: 'Coastal-road taverna and yacht club plus rear seaview jacuzzi lofts. Yacht guests via Sitia Port. Landscape kept.',
      images: [
        '00.jpg', '01.jpg', '02.jpg', '03.jpg', '04.jpg',
        '05.jpg', '06.jpg', '07.jpg', '08.jpg', '09.jpg',
        '10.jpg', '11.jpg', '12.jpg', '13.jpg'
      ]
    },
    {
      id: 'trypitos',
      name: 'Trypitos plot',
      place: 'Trypitos headland, Sitia, Crete',
      lat: 35.1986,
      lng: 26.1297,
      color: '#8fd4c4',
      status: 'Plot pin · Hellenistic site is protected',
      blurb: 'Sitia east coast, 3 km from town. Trypitos promontory is an excavated Hellenistic city — we do not build on the ruins. Pin marks the real headland for a nearby coastal plot. Investor siting, not a permit.',
      images: ['00.jpg', '01.jpg']
    },
    {
      id: 'agia-fotia',
      name: 'Agia Fotia plot',
      place: 'Agia Fotia, Sitia, Crete',
      lat: 35.192,
      lng: 26.161,
      color: '#7ec8ff',
      status: 'Plot pin · investor siting',
      blurb: 'Coastal coves 7 km east of Sitia on the Vai road. Real shore. No hotel invented on the beach.',
      images: ['00.jpg', '01.jpg']
    },
    {
      id: 'lagokefalo',
      name: 'Lagokefalo plot',
      place: 'Kato Lagokefalo · Roussa Eklisia district, Sitia',
      lat: 35.171,
      lng: 26.138,
      color: '#c4b07a',
      status: 'Plot pin · district siting',
      blurb: 'Kato Lagokefalo, archaic-settlement district next to Roussa Eklisia. Olive terraces, limestone. Pin is the district, not a cadastral deed.',
      images: ['00.jpg', '01.jpg']
    },
    {
      id: 'rousa',
      name: 'Rousa Eklisia',
      place: 'Roussa Ekklisia, Sitia, Crete',
      lat: 35.17816,
      lng: 26.14599,
      color: '#e8c36a',
      status: 'Real village · family ground',
      blurb: 'Existing mountain village 9 km from Sitia: plane-tree square, church, water, gulf view. Mano’s village. Not a new resort. Pin is the real settlement 35.17816°N 26.14599°E.',
      images: ['00.jpg', '01.jpg']
    },
    {
      id: 'yacht',
      name: 'Astranov Solar Yacht',
      place: 'Mandraki Marina, Rhodes',
      lat: 36.4507,
      lng: 28.2278,
      color: '#2ee0ff',
      status: 'Investor preview · hybrid concept',
      blurb: 'Classic superyacht look. Hybrid: flexible photovoltaic film laminated on hull, superstructure and decks — still reads as navy paint. Huge forward party sundeck. Home berth Mandraki (real harbour). Yacht itself is not built.',
      images: [
        '00.jpg', '01.jpg', '02.jpg', '03.jpg', '04.jpg',
        '05.jpg', '06.jpg', '07.jpg', '08.jpg', '09.jpg',
        '10.jpg', '11.jpg', '12.jpg', '13.jpg'
      ]
    },
    {
      id: 'brothers',
      name: 'Brothers Island Marina',
      place: 'Alimia natural harbour · Dodecanese candidate',
      lat: 36.27433,
      lng: 27.69921,
      color: '#7ad0ff',
      status: 'Concept siting · not built · not permitted',
      blurb: 'Proposed modest pontoon marina in an undeveloped Dodecanese natural harbour (Alimia candidate, between Rhodes and Halki). Solar yacht home berth. No town, no hotel towers. Requires environmental permit — shown as a siting study only.',
      images: [
        '00.jpg', '01.jpg', '02.jpg', '03.jpg', '04.jpg',
        '05.jpg', '06.jpg', '07.jpg', '08.jpg', '09.jpg',
        '10.jpg', '11.jpg', '12.jpg', '13.jpg'
      ]
    }
  ];

  function logCli(msg, kind) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(msg, kind || 'ok');
    } catch (_) {}
  }

  function imgUrl(p, file) {
    return '/media/projects/' + p.id + '/' + file + '?v=' + BUILD;
  }

  function injectCss() {
    if (document.getElementById('sn-proj-css')) return;
    var s = document.createElement('style');
    s.id = 'sn-proj-css';
    s.textContent =
      '#sn-proj-pins{position:fixed;inset:0;z-index:46;pointer-events:none;font-family:Inter,system-ui,sans-serif}' +
      '#sn-proj-pins .sn-pp{position:absolute;transform:translate(-50%,-110%);pointer-events:auto;display:flex;align-items:center;gap:8px;' +
      'height:40px;padding:0 14px 0 8px;border-radius:999px;border:1px solid rgba(180,220,255,.35);' +
      'background:rgba(6,12,22,.82);color:#e8f2ff;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
      'box-shadow:0 8px 24px rgba(0,0,0,.45);cursor:pointer;white-space:nowrap;max-width:min(78vw,320px);' +
      'font:650 12px/1 Inter,system-ui,sans-serif}' +
      '#sn-proj-pins .sn-pp:focus-visible{outline:2px solid #7ec8ff;outline-offset:2px}' +
      '#sn-proj-pins .sn-pp .dot{width:22px;height:22px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 10px currentColor}' +
      '#sn-proj-pins .sn-pp .lab{overflow:hidden;text-overflow:ellipsis}' +
      '#sn-proj-pins .sn-pp .sub{display:block;font:500 9px/1.1 Inter,system-ui,sans-serif;color:#9eb6cc;margin-top:2px}' +
      '#sn-proj-modal{position:fixed;inset:0;z-index:120;display:none;align-items:flex-end;justify-content:center;' +
      'background:rgba(2,6,14,.72);padding:0}' +
      '#sn-proj-modal.open{display:flex}' +
      '#sn-proj-card{width:min(100vw,920px);max-height:min(92vh,920px);background:#0b1220;color:#eaf2ff;border-radius:18px 18px 0 0;' +
      'overflow:hidden;display:flex;flex-direction:column;box-shadow:0 -12px 40px rgba(0,0,0,.55)}' +
      '#sn-proj-hero{position:relative;height:min(52vh,420px);background:#05080f;flex:0 0 auto}' +
      '#sn-proj-hero img{width:100%;height:100%;object-fit:cover;display:block}' +
      '#sn-proj-hero .nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;' +
      'border:1px solid rgba(200,230,255,.35);background:rgba(8,14,24,.55);color:#fff;font-size:22px;cursor:pointer}' +
      '#sn-proj-hero .nav.prev{left:10px}#sn-proj-hero .nav.next{right:10px}' +
      '#sn-proj-count{position:absolute;right:12px;bottom:12px;font:600 11px/1 Inter,system-ui,sans-serif;color:#d7e6f7;' +
      'background:rgba(0,0,0,.45);padding:4px 8px;border-radius:999px}' +
      '#sn-proj-body{padding:14px 16px 18px;overflow:auto}' +
      '#sn-proj-body h2{margin:0 0 4px;font:700 18px/1.2 Inter,system-ui,sans-serif}' +
      '#sn-proj-body .meta{font:500 12px/1.4 Inter,system-ui,sans-serif;color:#9ec4ee;margin:0 0 8px}' +
      '#sn-proj-body .status{display:inline-block;font:650 10px/1 Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;' +
      'color:#f3d48a;border:1px solid rgba(232,195,106,.4);border-radius:999px;padding:4px 8px;margin:0 0 10px}' +
      '#sn-proj-body p{margin:0 0 12px;font:400 13px/1.5 Inter,system-ui,sans-serif;color:#c5d6ea}' +
      '#sn-proj-thumbs{display:flex;gap:6px;overflow-x:auto;padding:2px 0 8px;-webkit-overflow-scrolling:touch}' +
      '#sn-proj-thumbs img{width:72px;height:48px;object-fit:cover;border-radius:8px;border:1px solid transparent;cursor:pointer;flex:0 0 auto}' +
      '#sn-proj-thumbs img.on{border-color:#7ec8ff}' +
      '#sn-proj-acts{display:flex;gap:8px;flex-wrap:wrap}' +
      '#sn-proj-acts button,#sn-proj-close{height:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(126,200,255,.4);' +
      'background:rgba(20,40,70,.6);color:#e8f2ff;font:650 12px/1 Inter,system-ui,sans-serif;cursor:pointer}' +
      '#sn-proj-close{position:absolute;top:10px;right:10px;z-index:2;width:40px;padding:0}' +
      '@media(min-width:720px){#sn-proj-modal{align-items:center;padding:24px}#sn-proj-card{border-radius:18px}}';
    document.head.appendChild(s);
  }

  var layer;
  var pins = [];
  var openId = null;
  var slide = 0;
  var liveImgs = {};

  function ensureLayer() {
    if (layer && layer.parentNode) return layer;
    injectCss();
    layer = document.getElementById('sn-proj-pins');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'sn-proj-pins';
      document.body.appendChild(layer);
    }
    if (!pins.length) {
      PROJECTS.forEach(function (p) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'sn-pp';
        b.setAttribute('data-id', p.id);
        b.innerHTML =
          '<span class="dot" style="background:' +
          p.color +
          ';color:' +
          p.color +
          '"></span><span class="lab">' +
          p.name +
          '<span class="sub">' +
          p.place +
          '</span></span>';
        b.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          try {
            if (global.SNGlobe) SNGlobe.consumeClick = true;
          } catch (_) {}
          openProject(p.id, true);
        });
        layer.appendChild(b);
        pins.push({ el: b, p: p });
      });
    }
    return layer;
  }

  function projectPin(p) {
    try {
      if (!global.THREE || !global.SNGlobe || !SNGlobe.ready) return null;
      var cam = SNGlobe.getCamera && SNGlobe.getCamera();
      var pivot = SNGlobe.getPivot && SNGlobe.getPivot();
      var renderer = SNGlobe.getRenderer && SNGlobe.getRenderer();
      if (!cam || !pivot || !renderer || !SNGlobe.latLngToVec) return null;
      var v = SNGlobe.latLngToVec(p.lat, p.lng, 1.018).clone();
      pivot.localToWorld(v);
      var w = v.clone();
      w.project(cam);
      if (w.z > 1) return null;
      var camPos = cam.position;
      var earth = SNGlobe.getEarth && SNGlobe.getEarth();
      if (earth) {
        var c = new THREE.Vector3();
        earth.getWorldPosition(c);
        if (camPos.distanceTo(v) > camPos.distanceTo(c) + 0.08) return null;
      }
      var rect = renderer.domElement.getBoundingClientRect();
      var x = (w.x * 0.5 + 0.5) * rect.width + rect.left;
      var y = (-w.y * 0.5 + 0.5) * rect.height + rect.top;
      if (x < -40 || y < -40 || x > window.innerWidth + 40 || y > window.innerHeight + 40) return null;
      return { x: x, y: y };
    } catch (_) {
      return null;
    }
  }

  function tick() {
    ensureLayer();
    var vis = 0;
    pins.forEach(function (row) {
      var s = projectPin(row.p);
      if (!s) {
        row.el.style.display = 'none';
        return;
      }
      vis++;
      row.el.style.display = 'flex';
      row.el.style.left = s.x + 'px';
      row.el.style.top = s.y + 'px';
    });
    return vis;
  }

  function existingSlides(p) {
    var cached = liveImgs[p.id];
    if (cached) return cached;
    return (p.images || []).map(function (f) {
      return imgUrl(p, f);
    });
  }

  function probeImages(p, cb) {
    if (liveImgs[p.id]) {
      cb(liveImgs[p.id]);
      return;
    }
    var out = [];
    var files = p.images || [];
    var left = files.length;
    if (!left) {
      liveImgs[p.id] = [];
      cb([]);
      return;
    }
    files.forEach(function (f) {
      var url = imgUrl(p, f);
      var im = new Image();
      im.onload = function () {
        out.push(url);
        left--;
        if (!left) {
          liveImgs[p.id] = out;
          cb(out);
        }
      };
      im.onerror = function () {
        left--;
        if (!left) {
          liveImgs[p.id] = out;
          cb(out);
        }
      };
      im.src = url;
    });
  }

  function byId(id) {
    for (var i = 0; i < PROJECTS.length; i++) if (PROJECTS[i].id === id) return PROJECTS[i];
    return null;
  }

  function flyTo(p) {
    try {
      if (global.SNGlobe && SNGlobe.goToPlace) {
        SNGlobe.goToPlace(p.lat, p.lng, { tier: 'city', pulse: true });
      } else if (global.SNGlobe && SNGlobe.flyNear) {
        SNGlobe.flyNear(p.lat, p.lng, 'city');
      }
    } catch (_) {}
    try {
      if (global.SNGlobe && SNGlobe.pulse) SNGlobe.pulse(p.lat, p.lng, 0x44ccff, p.name, 14000);
    } catch (_) {}
  }

  function modalEls() {
    var m = document.getElementById('sn-proj-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'sn-proj-modal';
    m.innerHTML =
      '<div id="sn-proj-card" role="dialog" aria-modal="true">' +
      '<button type="button" id="sn-proj-close" aria-label="Close">×</button>' +
      '<div id="sn-proj-hero"><img id="sn-proj-img" alt=""><button type="button" class="nav prev" aria-label="Previous">‹</button>' +
      '<button type="button" class="nav next" aria-label="Next">›</button><span id="sn-proj-count"></span></div>' +
      '<div id="sn-proj-body"><div class="status" id="sn-proj-status"></div><h2 id="sn-proj-title"></h2>' +
      '<div class="meta" id="sn-proj-meta"></div><p id="sn-proj-blurb"></p>' +
      '<p id="sn-proj-over" style="color:#9fe7c4;font-size:13px"></p>' +
      '<div id="sn-proj-thumbs"></div><div id="sn-proj-acts">' +
      '<button type="button" id="sn-proj-fly">Fly here</button>' +
      '<button type="button" id="sn-proj-nextp">Next project</button></div></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) {
      if (e.target === m) closeModal();
    });
    document.getElementById('sn-proj-close').onclick = closeModal;
    document.querySelector('#sn-proj-hero .prev').onclick = function () {
      step(-1);
    };
    document.querySelector('#sn-proj-hero .next').onclick = function () {
      step(1);
    };
    document.getElementById('sn-proj-fly').onclick = function () {
      var p = byId(openId);
      if (p) flyTo(p);
    };
    document.getElementById('sn-proj-nextp').onclick = function () {
      var i = 0;
      for (; i < PROJECTS.length; i++) if (PROJECTS[i].id === openId) break;
      openProject(PROJECTS[(i + 1) % PROJECTS.length].id, true);
    };
    return m;
  }

  function showSlide(urls) {
    if (!urls || !urls.length) return;
    if (slide < 0) slide = urls.length - 1;
    if (slide >= urls.length) slide = 0;
    var img = document.getElementById('sn-proj-img');
    img.src = urls[slide];
    document.getElementById('sn-proj-count').textContent = slide + 1 + ' / ' + urls.length;
    var thumbs = document.getElementById('sn-proj-thumbs');
    var t = thumbs.querySelectorAll('img');
    for (var i = 0; i < t.length; i++) t[i].classList.toggle('on', i === slide);
  }

  function step(d) {
    var p = byId(openId);
    if (!p) return;
    var urls = existingSlides(p);
    slide += d;
    showSlide(urls);
  }

  function openProject(id, fly) {
    var p = byId(id);
    if (!p) return;
    openId = id;
    slide = 0;
    if (fly) flyTo(p);
    var m = modalEls();
    document.getElementById('sn-proj-title').textContent = p.name;
    document.getElementById('sn-proj-meta').textContent =
      p.place + ' · ' + p.lat.toFixed(4) + ', ' + p.lng.toFixed(4);
    document.getElementById('sn-proj-status').textContent = p.status;
    document.getElementById('sn-proj-blurb').textContent = p.blurb;
    var over = document.getElementById('sn-proj-over');
    if (over)
      over.textContent =
        'Oversustainable · restore this ground and produce goods/services. Settlement: Astranov Coin — metals, stones, SpaceNet mining/use, EUR USD JPY RUB.';
    m.classList.add('open');
    probeImages(p, function (urls) {
      var thumbs = document.getElementById('sn-proj-thumbs');
      thumbs.innerHTML = '';
      urls.forEach(function (u, i) {
        var im = document.createElement('img');
        im.src = u;
        im.alt = p.name + ' ' + (i + 1);
        im.addEventListener('click', function () {
          slide = i;
          showSlide(urls);
        });
        thumbs.appendChild(im);
      });
      showSlide(urls);
    });
    logCli(p.name + ' · ' + p.status + ' · ' + p.place, 'ok');
  }

  function closeModal() {
    var m = document.getElementById('sn-proj-modal');
    if (m) m.classList.remove('open');
    openId = null;
  }

  function listCli() {
    logCli('Astranov projects · investor previews · not built', 'ok');
    PROJECTS.forEach(function (p) {
      logCli(p.name + ' · ' + p.place, 'ok');
    });
    logCli('Rhodes · Fanes · Koskinou · Kallithea', 'ok');
    logCli('Sitia · Petras · Trypitos · Agia Fotia · Lagokefalo · Rousa Eklisia', 'ok');
  }

  function handle(raw) {
    var low = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!low) return false;
    if (low === 'projects' || low === 'project' || low === 'investor' || low === 'investors') {
      listCli();
      var c = PROJECTS[0];
      try {
        if (global.SNGlobe && SNGlobe.frameRoute) {
          SNGlobe.frameRoute(
            PROJECTS.map(function (p) {
              return { lat: p.lat, lng: p.lng };
            }),
            { tier: 'regional' }
          );
        } else if (global.SNGlobe && SNGlobe.goToPlace) {
          SNGlobe.goToPlace(36.2, 28.0, { tier: 'national' });
        }
      } catch (_) {}
      openProject(c.id, false);
      return true;
    }
    for (var i = 0; i < PROJECTS.length; i++) {
      var p = PROJECTS[i];
      if (
        low === p.id ||
        low === p.name.toLowerCase() ||
        low.indexOf(p.id) >= 0 ||
        (p.id === 'yacht' && /solar yacht|superyacht|yachts/.test(low)) ||
        (p.id === 'brothers' && /brother|alimia|brothers island/.test(low)) ||
        (p.id === 'koskinou' && /koskinou|wood oven bar/.test(low)) ||
        (p.id === 'bodega' && /bodega/.test(low)) ||
        (p.id === 'fanes' && /fanes|villages of colors|village of colors/.test(low)) ||
        (p.id === 'lofts' && /loft|diginomad|nomad/.test(low)) ||
        (p.id === 'sitia' && /sitia|petras|yacht club/.test(low)) ||
        (p.id === 'trypitos' && /trypitos|tripitos/.test(low)) ||
        (p.id === 'agia-fotia' && /agia fotia|agia-fotia|ag\.? fotia|fotini/.test(low)) ||
        (p.id === 'lagokefalo' && /lagokefalo|lagocefalo|kato lago/.test(low)) ||
        (p.id === 'rousa' && /rousa|roussa|eklis|ekklis/.test(low)) ||
        (p.id === 'villa' && /villa|rose stone/.test(low)) ||
        (p.id === 'house-art' && /house of art/.test(low)) ||
        (p.id === 'kallithea' &&
          /kalithea|kallithea|καλλιθ|ecological village|^village$|glass motor|motor house|motorhouse/.test(low))
      ) {
        openProject(p.id, true);
        return true;
      }
    }
    return false;
  }

  function interceptCli() {
    var form = document.getElementById('cli-form') || document.querySelector('#panel form');
    if (form && !form.__snProj) {
      form.__snProj = 1;
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
    var top = document.getElementById('stc-cmd-form') || document.querySelector('#sn-topchrome-panel form');
    if (top && !top.__snProj) {
      top.__snProj = 1;
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

  function boot() {
    ensureLayer();
    interceptCli();
    if (global.SNGlobe && SNGlobe.onFrame && !SNGlobe.__snProjFrame) {
      SNGlobe.__snProjFrame = 1;
      SNGlobe.onFrame(tick);
    } else {
      setInterval(tick, 80);
    }
    tick();
    try {
      var q = new URLSearchParams(location.search).get('project') || (location.hash || '').replace(/^#/, '');
      if (q) {
        var id = q;
        if (!byId(id)) {
          PROJECTS.forEach(function (p) {
            if (p.id === q || p.name.toLowerCase().indexOf(q.toLowerCase()) >= 0) id = p.id;
          });
        }
        if (byId(id)) setTimeout(function () { openProject(id, true); }, 1200);
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 800);
  setTimeout(boot, 2400);

  global.SNProjects = {
    build: BUILD,
    all: PROJECTS,
    open: openProject,
    openId: function () {
      return openId;
    },
    handle: handle,
    tick: tick
  };
})(typeof window !== 'undefined' ? window : globalThis);
