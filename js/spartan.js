/**
 * Astranov Spartan core — rebuild v1
 * Goals only: stable globe · single CLI · city map · delivery quotes · crawlable app surface
 * No dual chrome, no auto-fly fight, no phase megabundles.
 */
(function () {
  'use strict';

  var BUILD = '20260720140000';
  window.__ASTRANOV_SPARTAN__ = BUILD;
  window.__ASTRANOV_MANIFEST__ = {
    mode: 'spartan-v1',
    critical: ['/js/spartan.js'],
    app: [],
    features: [],
    deferred: []
  };

  /* ── DOM ─────────────────────────────────────────────── */
  var el = {
    globe: document.getElementById('globe'),
    cityMap: document.getElementById('city-map'),
    cli: document.getElementById('cli-input'),
    log: document.getElementById('cli-log'),
    status: document.getElementById('cli-status'),
    cityPanel: document.getElementById('city-panel'),
    cityList: document.getElementById('city-list'),
    deliveryPanel: document.getElementById('delivery-panel'),
    deliveryBody: document.getElementById('delivery-body'),
    boot: document.getElementById('boot')
  };

  function setStatus(msg, kind) {
    if (!el.status) return;
    el.status.textContent = msg || '';
    el.status.dataset.kind = kind || 'ok';
  }

  function logLine(msg, kind) {
    if (!el.log) return;
    var row = document.createElement('div');
    row.className = 'log-line' + (kind ? ' ' + kind : '');
    row.textContent = msg;
    el.log.appendChild(row);
    while (el.log.children.length > 40) el.log.removeChild(el.log.firstChild);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function hideBoot() {
    if (el.boot) el.boot.remove();
  }

  /* ── Cities (offline, real coords only) ──────────────── */
  var CITIES = [
    { name: 'Athens', lat: 37.9838, lng: 23.7275 },
    { name: 'Thessaloniki', lat: 40.6401, lng: 22.9444 },
    { name: 'Rhodes', lat: 36.4341, lng: 28.2176 },
    { name: 'Heraklion', lat: 35.3387, lng: 25.1442 },
    { name: 'Istanbul', lat: 41.0082, lng: 28.9784 },
    { name: 'Rome', lat: 41.9028, lng: 12.4964 },
    { name: 'Paris', lat: 48.8566, lng: 2.3522 },
    { name: 'Berlin', lat: 52.52, lng: 13.405 },
    { name: 'London', lat: 51.5074, lng: -0.1278 },
    { name: 'Madrid', lat: 40.4168, lng: -3.7038 },
    { name: 'New York', lat: 40.7128, lng: -74.006 },
    { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
    { name: 'Dubai', lat: 25.2048, lng: 55.2708 },
    { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
    { name: 'Sydney', lat: -33.8688, lng: 151.2093 }
  ];

  function haversineKm(aLat, aLng, bLat, bLng) {
    var R = 6371;
    var dLat = (bLat - aLat) * Math.PI / 180;
    var dLng = (bLng - aLng) * Math.PI / 180;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function nearestCities(lat, lng, n) {
    n = n || 6;
    return CITIES.map(function (c) {
      return { name: c.name, lat: c.lat, lng: c.lng, km: haversineKm(lat, lng, c.lat, c.lng) };
    }).sort(function (a, b) { return a.km - b.km; }).slice(0, n);
  }

  /* ── Delivery engine (pricing + weather surcharge) ───── */
  var Delivery = {
    BASE: 3,
    BLOCK: 3,
    KM_BLOCK: 3,
    KG_BLOCK: 3,
    SURCHARGE: 3,
    PLATFORM: 0.03,
    _wx: null,
    _wxAt: 0,

    blockFee: function (units, size) {
      var extra = Math.max(0, units - size);
      return extra <= 0 ? 0 : Math.ceil(extra / size) * this.BLOCK;
    },

    isNight: function (d) {
      var h = (d || new Date()).getHours();
      return h < 9 || h >= 21;
    },

    fetchWeather: function (lat, lng) {
      var self = this;
      var now = Date.now();
      if (self._wx && now - self._wxAt < 600000) return Promise.resolve(self._wx);
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
        '&longitude=' + lng + '&current=weather_code,precipitation,wind_speed_10m&timezone=auto';
      return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
        var c = j.current || {};
        var code = c.weather_code || 0;
        var precip = c.precipitation || 0;
        var wind = c.wind_speed_10m || 0;
        var badCodes = [51, 53, 55, 61, 63, 65, 71, 73, 75, 80, 81, 82, 95, 96, 99];
        var bad = precip > 0.4 || wind > 40 || badCodes.indexOf(code) >= 0;
        self._wx = { bad: bad, precip: precip, wind: wind, code: code };
        self._wxAt = now;
        return self._wx;
      }).catch(function () {
        return { bad: false, precip: 0, wind: 0, code: 0 };
      });
    },

    quote: function (opts) {
      opts = opts || {};
      var self = this;
      var km = Math.max(0, Number(opts.km) || 0);
      var kg = Math.max(0, Number(opts.kg) || 3);
      var sub = Math.max(0, Number(opts.subtotal) || 0);
      var when = opts.at ? new Date(opts.at) : new Date();
      var wxP = opts.lat != null
        ? this.fetchWeather(opts.lat, opts.lng)
        : Promise.resolve({ bad: false });

      return wxP.then(function (wx) {
        var distance = self.BASE + self.blockFee(km, self.KM_BLOCK);
        var weight = self.blockFee(kg, self.KG_BLOCK);
        var surcharges = [];
        if (self.isNight(when)) surcharges.push({ id: 'night', label: 'Night / before 09:00', eur: self.SURCHARGE });
        if (wx.bad) surcharges.push({ id: 'weather', label: 'Bad weather', eur: self.SURCHARGE });
        var delivery = distance + weight + surcharges.reduce(function (s, x) { return s + x.eur; }, 0);
        var platform = Math.round((sub + delivery) * self.PLATFORM * 100) / 100;
        var total = Math.round((sub + delivery + platform) * 100) / 100;
        return {
          km: km, kg: kg, subtotal: sub,
          delivery: delivery, platform: platform, total: total,
          distance_fee: distance, weight_fee: weight,
          surcharges: surcharges, weather: wx,
          driver_payout: Math.round(delivery * 0.85 * 100) / 100
        };
      });
    },

    format: function (q) {
      if (!q) return '';
      var s = q.total.toFixed(2) + ' Coins · delivery ' + q.delivery.toFixed(2);
      if (q.surcharges && q.surcharges.length) {
        s += ' · ' + q.surcharges.map(function (x) { return x.label; }).join(', ');
      }
      s += ' · platform 3%';
      return s;
    }
  };
  window.AstranovDelivery = Delivery;

  /* ── Demo vendors (city map pins) ────────────────────── */
  var VENDORS = [
    { id: 'v1', name: 'Pitogyra Rhodes', lat: 36.4412, lng: 28.2225, items: [
      { name: 'Pitogyra', price: 3.5 }, { name: 'Beer', price: 2.5 }
    ]},
    { id: 'v2', name: 'Kafeneio', lat: 36.4358, lng: 28.2188, items: [
      { name: 'Coffee', price: 2.2 }, { name: 'Water', price: 0.5 }
    ]},
    { id: 'v3', name: 'Mini Market', lat: 36.8932, lng: 27.288, items: [
      { name: 'Water', price: 0.6 }, { name: 'Snacks', price: 2.0 }
    ]}
  ];

  /* ── Globe (single controller, damped) ───────────────── */
  var Globe = {
    renderer: null,
    scene: null,
    camera: null,
    earth: null,
    pivot: null,
    drag: false,
    px: 0,
    py: 0,
    velX: 0,
    velY: 0,
    // Low sensitivity + friction = no crazy spin / tremble
    SENS: 0.0024,
    FRICTION: 0.88,
    MAX_VEL: 0.035,
    ZOOM_MIN: 1.35,
    ZOOM_MAX: 8,
    pointerId: null,

    init: function () {
      if (typeof THREE === 'undefined') {
        setStatus('Three.js missing', 'err');
        return false;
      }
      if (!el.globe) return false;

      var w = window.innerWidth;
      var h = window.innerHeight;
      var mobile = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x000000);
      this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      this.camera.position.set(0, 0, mobile ? 3.2 : 2.85);
      this.camera.lookAt(0, 0, 0);

      this.renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: false, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
      this.renderer.setSize(w, h, false);
      this.renderer.domElement.style.display = 'block';
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.renderer.domElement.style.touchAction = 'none';
      el.globe.innerHTML = '';
      el.globe.appendChild(this.renderer.domElement);

      var amb = new THREE.AmbientLight(0x334466, 0.85);
      this.scene.add(amb);
      var sun = new THREE.DirectionalLight(0xffffff, 1.05);
      sun.position.set(5, 2, 3);
      this.scene.add(sun);

      this.pivot = new THREE.Group();
      this.scene.add(this.pivot);

      var seg = mobile ? 40 : 64;
      var geo = new THREE.SphereGeometry(1, seg, seg);
      var mat = new THREE.MeshPhongMaterial({
        color: 0x1a4a8a,
        emissive: 0x041018,
        shininess: 18,
        specular: 0x335577
      });
      this.earth = new THREE.Mesh(geo, mat);
      this.pivot.add(this.earth);
      this.pivot.rotation.y = 0.82;
      this.pivot.rotation.x = 0.12;

      try {
        var loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        var urls = [
          'https://cdn.jsdelivr.net/npm/three-globe@2.31.1/example/img/earth-blue-marble.jpg',
          'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg'
        ];
        var self = this;
        var tryTex = function (i) {
          if (i >= urls.length) return;
          loader.load(urls[i], function (tex) {
            tex.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
            mat.map = tex;
            mat.color.set(0xffffff);
            mat.needsUpdate = true;
          }, undefined, function () { tryTex(i + 1); });
        };
        tryTex(0);
      } catch (_) {}

      this._bindPointer(this.renderer.domElement);
      window.addEventListener('resize', this._onResize.bind(this));
      this._loop();
      return true;
    },

    _onResize: function () {
      if (!this.camera || !this.renderer) return;
      var w = window.innerWidth;
      var h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    },

    _bindPointer: function (canvas) {
      var self = this;
      canvas.addEventListener('pointerdown', function (e) {
        if (CityMapUI.active) return;
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        self.drag = true;
        self.pointerId = e.pointerId;
        self.px = e.clientX;
        self.py = e.clientY;
        self.velX = 0;
        self.velY = 0;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        e.preventDefault();
      });
      canvas.addEventListener('pointermove', function (e) {
        if (!self.drag || e.pointerId !== self.pointerId) return;
        var dx = e.clientX - self.px;
        var dy = e.clientY - self.py;
        self.px = e.clientX;
        self.py = e.clientY;
        self.pivot.rotation.y += dx * self.SENS;
        self.pivot.rotation.x = Math.max(-1.2, Math.min(1.2, self.pivot.rotation.x + dy * self.SENS));
        self.velX = Math.max(-self.MAX_VEL, Math.min(self.MAX_VEL, dx * self.SENS * 0.55));
        self.velY = Math.max(-self.MAX_VEL, Math.min(self.MAX_VEL, dy * self.SENS * 0.55));
        e.preventDefault();
      });
      var end = function (e) {
        if (e.pointerId != null && self.pointerId != null && e.pointerId !== self.pointerId) return;
        self.drag = false;
        self.pointerId = null;
      };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('pointerleave', function (e) {
        if (self.drag && e.pointerId === self.pointerId) end(e);
      });
      canvas.addEventListener('wheel', function (e) {
        if (CityMapUI.active) return;
        e.preventDefault();
        self.velX = 0;
        self.velY = 0;
        var factor = Math.exp(e.deltaY * 0.0011);
        self.camera.position.z = Math.max(self.ZOOM_MIN, Math.min(self.ZOOM_MAX, self.camera.position.z * factor));
        self.camera.lookAt(0, 0, 0);
      }, { passive: false });
    },

    _loop: function () {
      var self = this;
      function frame() {
        requestAnimationFrame(frame);
        if (!self.renderer) return;
        if (!self.drag && (Math.abs(self.velX) > 0.00005 || Math.abs(self.velY) > 0.00005)) {
          self.pivot.rotation.y += self.velX;
          self.pivot.rotation.x = Math.max(-1.2, Math.min(1.2, self.pivot.rotation.x + self.velY));
          self.velX *= self.FRICTION;
          self.velY *= self.FRICTION;
          if (Math.abs(self.velX) < 0.00005) self.velX = 0;
          if (Math.abs(self.velY) < 0.00005) self.velY = 0;
        }
        self.renderer.render(self.scene, self.camera);
      }
      frame();
    },

    facingLatLng: function () {
      var x = this.pivot.rotation.x;
      var y = this.pivot.rotation.y;
      var lat = Math.max(-85, Math.min(85, -x * 180 / Math.PI));
      var lng = ((-y * 180 / Math.PI) % 360 + 540) % 360 - 180;
      return { lat: lat, lng: lng };
    },

    lookAtLatLng: function (lat, lng) {
      this.velX = 0;
      this.velY = 0;
      this.pivot.rotation.x = Math.max(-1.2, Math.min(1.2, -lat * Math.PI / 180));
      this.pivot.rotation.y = -lng * Math.PI / 180;
    }
  };
  window.AstranovGlobe = Globe;

  /* ── City map (Leaflet) ──────────────────────────────── */
  var CityMapUI = {
    active: false,
    map: null,
    markers: [],
    userMarker: null,

    ensureLeaflet: function () {
      if (typeof L !== 'undefined') return Promise.resolve();
      return new Promise(function (resolve, reject) {
        if (document.querySelector('link[data-leaflet]')) {
          var wait = setInterval(function () {
            if (typeof L !== 'undefined') { clearInterval(wait); resolve(); }
          }, 50);
          setTimeout(function () { clearInterval(wait); if (typeof L === 'undefined') reject(new Error('leaflet')); else resolve(); }, 8000);
          return;
        }
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.setAttribute('data-leaflet', '1');
        document.head.appendChild(link);
        var s = document.createElement('script');
        s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        s.onload = function () { resolve(); };
        s.onerror = function () { reject(new Error('leaflet load')); };
        document.head.appendChild(s);
      });
    },

    open: function (lat, lng, label) {
      var self = this;
      setStatus('Opening city map…', 'busy');
      return this.ensureLeaflet().then(function () {
        if (!el.cityMap) throw new Error('no city-map element');
        el.cityMap.classList.add('open');
        el.cityMap.setAttribute('aria-hidden', 'false');
        document.body.classList.add('city-map-active');
        if (el.globe) el.globe.classList.add('dimmed');

        if (!self.map) {
          self.map = L.map(el.cityMap, {
            zoomControl: true,
            attributionControl: true,
            scrollWheelZoom: true
          });
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(self.map);
        }

        self.active = true;
        self.map.setView([lat, lng], 14, { animate: false });
        setTimeout(function () { self.map.invalidateSize(); }, 80);

        self._clearMarkers();
        self.userMarker = L.circleMarker([lat, lng], {
          radius: 8, color: '#3d9eff', fillColor: '#1a6fd4', fillOpacity: 0.9, weight: 2
        }).addTo(self.map).bindPopup(label || 'You');

        VENDORS.forEach(function (v) {
          var d = haversineKm(lat, lng, v.lat, v.lng);
          if (d > 80) return;
          var m = L.marker([v.lat, v.lng]).addTo(self.map);
          m.bindPopup('<b>' + v.name + '</b><br>' +
            v.items.map(function (i) { return i.name + ' ' + i.price.toFixed(2); }).join('<br>') +
            '<br><button type="button" data-vendor="' + v.id + '" class="quote-btn">Quote delivery</button>');
          m.on('popupopen', function () {
            var btn = document.querySelector('.quote-btn[data-vendor="' + v.id + '"]');
            if (btn) {
              btn.onclick = function () {
                CLI.quoteToVendor(v, lat, lng);
              };
            }
          });
          self.markers.push(m);
        });

        window._lastPos = { lat: lat, lng: lng };
        setStatus('City map · ' + (label || lat.toFixed(3) + ',' + lng.toFixed(3)), 'ok');
        logLine('City map open · drag map · tap vendor for delivery quote', 'ok');
        if (el.cityPanel) el.cityPanel.hidden = true;
        return true;
      }).catch(function (e) {
        setStatus('City map failed', 'err');
        logLine(String(e && e.message || e), 'err');
        return false;
      });
    },

    _clearMarkers: function () {
      var self = this;
      this.markers.forEach(function (m) { try { self.map.removeLayer(m); } catch (_) {} });
      this.markers = [];
      if (this.userMarker && this.map) {
        try { this.map.removeLayer(this.userMarker); } catch (_) {}
        this.userMarker = null;
      }
    },

    close: function () {
      this.active = false;
      if (el.cityMap) {
        el.cityMap.classList.remove('open');
        el.cityMap.setAttribute('aria-hidden', 'true');
      }
      document.body.classList.remove('city-map-active');
      if (el.globe) el.globe.classList.remove('dimmed');
      setStatus('Earth · drag to turn · scroll to zoom', 'ok');
      logLine('Back to globe', 'ok');
    }
  };
  window.AstranovCityMap = CityMapUI;

  /* ── CLI ─────────────────────────────────────────────── */
  var CLI = {
    bind: function () {
      var form = document.getElementById('cli-form');
      var self = this;
      if (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var text = (el.cli && el.cli.value || '').trim();
          if (!text) return;
          if (el.cli) el.cli.value = '';
          self.run(text);
        });
      }
      var locate = document.getElementById('btn-locate');
      if (locate) locate.addEventListener('click', function () { self.run('locate'); });
      var city = document.getElementById('btn-city');
      if (city) city.addEventListener('click', function () { self.run('city'); });
      var back = document.getElementById('btn-globe');
      if (back) back.addEventListener('click', function () { CityMapUI.close(); });
      var help = document.getElementById('btn-help');
      if (help) help.addEventListener('click', function () { self.run('help'); });
    },

    run: function (raw) {
      var text = String(raw || '').trim();
      if (!text) return;
      logLine('> ' + text, 'user');
      var low = text.toLowerCase();
      var parts = low.split(/\s+/);
      var cmd = parts[0];

      if (cmd === 'help' || cmd === '?') {
        logLine('Commands: locate · city [name] · globe · quote <km> [kg] [subtotal] · vendors · help', 'ok');
        setStatus('Help', 'ok');
        return;
      }
      if (cmd === 'locate' || cmd === 'gps') {
        this.locate();
        return;
      }
      if (cmd === 'globe' || cmd === 'earth' || cmd === 'back') {
        CityMapUI.close();
        return;
      }
      if (cmd === 'city' || cmd === 'map') {
        var name = parts.slice(1).join(' ');
        if (name) this.openCityByName(name);
        else this.pickCities();
        return;
      }
      if (cmd === 'vendors') {
        this.listVendors();
        return;
      }
      if (cmd === 'quote' || cmd === 'delivery') {
        var km = parseFloat(parts[1]);
        var kg = parseFloat(parts[2]);
        var sub = parseFloat(parts[3]);
        if (isNaN(km)) {
          logLine('Usage: quote <km> [kg] [subtotal_eur]', 'err');
          return;
        }
        this.quoteSimple(km, isNaN(kg) ? 3 : kg, isNaN(sub) ? 0 : sub);
        return;
      }
      var hit = CITIES.find(function (c) { return c.name.toLowerCase() === low; });
      if (hit) {
        this.openCity(hit);
        return;
      }
      logLine('Unknown. Type help', 'err');
    },

    locate: function () {
      setStatus('Locating…', 'busy');
      if (!navigator.geolocation) {
        setStatus('No GPS', 'err');
        logLine('Geolocation unavailable — try: city Rhodes', 'err');
        return;
      }
      navigator.geolocation.getCurrentPosition(function (pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        window._lastPos = { lat: lat, lng: lng };
        Globe.lookAtLatLng(lat, lng);
        logLine('Located ' + lat.toFixed(4) + ', ' + lng.toFixed(4), 'ok');
        CityMapUI.open(lat, lng, 'You');
      }, function (err) {
        setStatus('GPS denied', 'err');
        logLine('Location denied — try: city Athens', 'err');
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    },

    pickCities: function () {
      var pos = window._lastPos || Globe.facingLatLng();
      var list = nearestCities(pos.lat, pos.lng, 8);
      if (!el.cityPanel || !el.cityList) {
        logLine('Cities: ' + list.map(function (c) { return c.name; }).join(', '), 'ok');
        return;
      }
      el.cityList.innerHTML = '';
      list.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'city-chip';
        b.textContent = c.name + ' · ' + Math.round(c.km) + 'km';
        b.addEventListener('click', function () {
          CLI.openCity(c);
        });
        el.cityList.appendChild(b);
      });
      el.cityPanel.hidden = false;
      setStatus('Pick a city', 'ok');
    },

    openCityByName: function (name) {
      var n = name.toLowerCase();
      var hit = CITIES.find(function (c) { return c.name.toLowerCase().indexOf(n) === 0 || c.name.toLowerCase() === n; });
      if (!hit) {
        logLine('City not in offline list. Try Athens, Rhodes, London…', 'err');
        return;
      }
      this.openCity(hit);
    },

    openCity: function (c) {
      if (el.cityPanel) el.cityPanel.hidden = true;
      Globe.lookAtLatLng(c.lat, c.lng);
      CityMapUI.open(c.lat, c.lng, c.name);
    },

    listVendors: function () {
      VENDORS.forEach(function (v) {
        logLine(v.name + ' @ ' + v.lat.toFixed(3) + ',' + v.lng.toFixed(3), 'ok');
      });
    },

    quoteSimple: function (km, kg, sub) {
      var pos = window._lastPos || { lat: 36.43, lng: 28.22 };
      setStatus('Quoting…', 'busy');
      Delivery.quote({ km: km, kg: kg, subtotal: sub, lat: pos.lat, lng: pos.lng }).then(function (q) {
        logLine(Delivery.format(q), 'ok');
        CLI.showDelivery(q, 'Custom route · ' + km + ' km');
        setStatus('Quote ready', 'ok');
      });
    },

    quoteToVendor: function (vendor, fromLat, fromLng) {
      var km = haversineKm(fromLat, fromLng, vendor.lat, vendor.lng);
      var sub = (vendor.items || []).reduce(function (s, i) { return s + (i.price || 0); }, 0);
      setStatus('Quoting ' + vendor.name + '…', 'busy');
      Delivery.quote({ km: km, kg: 3, subtotal: sub, lat: fromLat, lng: fromLng }).then(function (q) {
        logLine(vendor.name + ' · ' + Delivery.format(q), 'ok');
        CLI.showDelivery(q, vendor.name + ' · ' + km.toFixed(1) + ' km');
        setStatus('Delivery quote', 'ok');
      });
    },

    showDelivery: function (q, title) {
      if (!el.deliveryPanel || !el.deliveryBody) return;
      el.deliveryPanel.hidden = false;
      var lines = [
        '<strong>' + (title || 'Delivery') + '</strong>',
        'Distance fee: ' + q.distance_fee.toFixed(2),
        'Weight fee: ' + q.weight_fee.toFixed(2),
        'Delivery: ' + q.delivery.toFixed(2),
        'Goods: ' + q.subtotal.toFixed(2),
        'Platform 3%: ' + q.platform.toFixed(2),
        'Total: <b>' + q.total.toFixed(2) + ' Coins</b>',
        'Driver payout: ' + q.driver_payout.toFixed(2)
      ];
      if (q.surcharges && q.surcharges.length) {
        lines.push('Surcharges: ' + q.surcharges.map(function (x) { return x.label; }).join(', '));
      }
      el.deliveryBody.innerHTML = lines.map(function (l) { return '<div>' + l + '</div>'; }).join('');
    }
  };
  window.AstranovCLI = CLI;

  /* ── Boot ────────────────────────────────────────────── */
  function boot() {
    try {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (r) { r.unregister(); });
        });
      }
      if (window.caches && caches.keys) {
        caches.keys().then(function (keys) {
          keys.forEach(function (k) { caches.delete(k); });
        });
      }
    } catch (_) {}

    CLI.bind();
    var closeDel = document.getElementById('delivery-close');
    if (closeDel) closeDel.addEventListener('click', function () {
      if (el.deliveryPanel) el.deliveryPanel.hidden = true;
    });
    var closeCity = document.getElementById('city-panel-close');
    if (closeCity) closeCity.addEventListener('click', function () {
      if (el.cityPanel) el.cityPanel.hidden = true;
    });

    if (!Globe.init()) {
      setStatus('Globe failed', 'err');
      hideBoot();
      return;
    }
    hideBoot();
    setStatus('Earth · drag gently · scroll zoom · Locate / City', 'ok');
    logLine('Spartan v1 · globe + city map + delivery quotes', 'ok');
    logLine('Type help · or press Locate', 'ok');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
