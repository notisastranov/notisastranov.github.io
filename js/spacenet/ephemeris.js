/**
 * SNEphemeris — live sky positions (JPL Kepler + Meeus Moon)
 * Sun, Moon, 8 planets: real direction from Earth right now.
 * Visual distances are compressed so the SOLAR view can show the system.
 */
(function (global) {
  'use strict';

  var DEG = Math.PI / 180;
  var RAD = 180 / Math.PI;
  var J2000 = 2451545.0;
  var OBL0 = 23.439291;
  var EARTH_R_KM = 6378.14;

  /* JPL Keplerian elements (approx positions of the major planets)
   * a AU, e, I°, L°, ϖ°, Ω°  + rates per Julian century */
  var PLANETS = [
    { id: 'mercury', name: 'Mercury', color: 0xb0b0b0, r: 0.055,
      a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906],
      I: [7.00497902, -0.00594749], L: [252.25032350, 149472.67411175],
      w: [77.45779628, 0.16047689], O: [48.33076593, -0.12534081] },
    { id: 'venus', name: 'Venus', color: 0xe8d4a0, r: 0.095,
      a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107],
      I: [3.39467605, -0.00078890], L: [181.97909950, 58517.81538729],
      w: [131.60246718, 0.00268329], O: [76.67984255, -0.27769418] },
    { id: 'earth', name: 'Earth', color: 0x3d9eff, r: 1,
      a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392],
      I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981],
      w: [102.93768193, 0.32327364], O: [0, 0] },
    { id: 'mars', name: 'Mars', color: 0xc45a32, r: 0.072,
      a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882],
      I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499],
      w: [-23.94362959, 0.44441088], O: [49.55953891, -0.29257343] },
    { id: 'jupiter', name: 'Jupiter', color: 0xc9a066, r: 0.18,
      a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253],
      I: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775],
      w: [14.72847983, 0.21252668], O: [100.47390909, 0.20469106] },
    { id: 'saturn', name: 'Saturn', color: 0xd4c4a0, r: 0.15,
      a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991],
      I: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201],
      w: [92.59887831, -0.41897216], O: [113.66242448, -0.28867794] },
    { id: 'uranus', name: 'Uranus', color: 0x7ec8e3, r: 0.11,
      a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397],
      I: [0.77263783, -0.00242939], L: [313.23810451, 428.48202785],
      w: [170.95427630, 0.40805281], O: [74.01692503, 0.04240589] },
    { id: 'neptune', name: 'Neptune', color: 0x2b5cff, r: 0.105,
      a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105],
      I: [1.77004347, 0.00035372], L: [-55.12002969, 218.45945325],
      w: [44.96476227, -0.32241464], O: [131.78422574, -0.00508664] },
  ];

  function wrap360(x) {
    x = x % 360;
    if (x < 0) x += 360;
    return x;
  }
  function wrap180(x) {
    x = wrap360(x);
    if (x > 180) x -= 360;
    return x;
  }
  function julianDay(d) {
    d = d || new Date();
    return d.getTime() / 86400000 + 2440587.5;
  }
  function centuries(jd) {
    return (jd - J2000) / 36525;
  }
  function gmstDeg(jd) {
    var d = jd - J2000;
    return wrap360(280.46061837 + 360.98564736629 * d);
  }
  function obliquity(T) {
    return (OBL0 - 0.0130042 * T) * DEG;
  }
  function keplerE(M, e) {
    var E = M;
    var i;
    for (i = 0; i < 10; i++) {
      var dE = (M - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
      E += dE;
      if (Math.abs(dE) < 1e-9) break;
    }
    return E;
  }

  function helioEcliptic(p, T) {
    var a = p.a[0] + p.a[1] * T;
    var e = p.e[0] + p.e[1] * T;
    var I = (p.I[0] + p.I[1] * T) * DEG;
    var L = wrap360(p.L[0] + p.L[1] * T) * DEG;
    var varpi = wrap360(p.w[0] + p.w[1] * T) * DEG;
    var Om = wrap360(p.O[0] + p.O[1] * T) * DEG;
    var w = varpi - Om;
    var M = L - varpi;
    M = Math.atan2(Math.sin(M), Math.cos(M));
    var E = keplerE(M, e);
    var xv = a * (Math.cos(E) - e);
    var yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
    var r = Math.sqrt(xv * xv + yv * yv);
    var trueA = Math.atan2(yv, xv);
    var xh =
      r *
      (Math.cos(Om) * Math.cos(w + trueA) -
        Math.sin(Om) * Math.sin(w + trueA) * Math.cos(I));
    var yh =
      r *
      (Math.sin(Om) * Math.cos(w + trueA) +
        Math.cos(Om) * Math.sin(w + trueA) * Math.cos(I));
    var zh = r * (Math.sin(w + trueA) * Math.sin(I));
    return { x: xh, y: yh, z: zh, r: r, a: a };
  }

  function eclipticToEquatorial(x, y, z, T) {
    var eps = obliquity(T);
    var ce = Math.cos(eps);
    var se = Math.sin(eps);
    return { x: x, y: y * ce - z * se, z: y * se + z * ce };
  }

  function equatorialToLatLng(eq, jd) {
    var ra = Math.atan2(eq.y, eq.x) * RAD;
    var dec = Math.asin(Math.max(-1, Math.min(1, eq.z / Math.sqrt(eq.x * eq.x + eq.y * eq.y + eq.z * eq.z)))) * RAD;
    var gst = gmstDeg(jd);
    var lng = wrap180(ra - gst);
    return { lat: dec, lng: lng, ra: wrap360(ra), dec: dec };
  }

  function moonGeocentric(jd) {
    var T = centuries(jd);
    var Lp = wrap360(218.3164477 + 481267.88123421 * T) * DEG;
    var D = wrap360(297.8501921 + 445267.1114034 * T) * DEG;
    var M = wrap360(357.5291092 + 35999.0502909 * T) * DEG;
    var Mp = wrap360(134.9633964 + 477198.8675055 * T) * DEG;
    var F = wrap360(93.2720950 + 483202.0175233 * T) * DEG;
    var lon =
      Lp +
      (6.288774 * Math.sin(Mp) +
        1.274027 * Math.sin(2 * D - Mp) +
        0.658314 * Math.sin(2 * D) +
        0.213618 * Math.sin(2 * Mp) -
        0.185116 * Math.sin(M) -
        0.114332 * Math.sin(2 * F) +
        0.058793 * Math.sin(2 * D - 2 * Mp) +
        0.057066 * Math.sin(2 * D - M - Mp) +
        0.053322 * Math.sin(2 * D + Mp)) *
        DEG;
    var lat =
      (5.128122 * Math.sin(F) +
        0.280602 * Math.sin(Mp + F) +
        0.277693 * Math.sin(Mp - F) +
        0.173238 * Math.sin(2 * D - F) +
        0.055413 * Math.sin(2 * D + F - Mp) +
        0.046272 * Math.sin(2 * D - F - Mp)) *
      DEG;
    var distKm =
      385000.56 -
      20905.355 * Math.cos(Mp) -
      3699.111 * Math.cos(2 * D - Mp) -
      2955.968 * Math.cos(2 * D) -
      569.925 * Math.cos(2 * Mp);
    var cl = Math.cos(lat);
    var x = distKm * cl * Math.cos(lon);
    var y = distKm * cl * Math.sin(lon);
    var z = distKm * Math.sin(lat);
    var eq = eclipticToEquatorial(x, y, z, T);
    var ll = equatorialToLatLng(eq, jd);
    var phase = wrap360((1 - Math.cos(D)) * 0.5 * 360);
    var illum = 0.5 * (1 - Math.cos(D));
    return {
      lat: ll.lat,
      lng: ll.lng,
      ra: ll.ra,
      dec: ll.dec,
      distEarthRadii: distKm / EARTH_R_KM,
      distKm: distKm,
      phase: illum,
      phaseDeg: phase,
    };
  }

  /* Collective AI world — Earth orbit ABOVE the Moon (visual scale). */
  var ASTRANOV = {
    id: 'astranov',
    name: 'Astranov',
    visR: 4.28,
    incl: 18.2,
    Omega: 82,
    M0: 80,
    periodDays: 27.32166 * Math.pow(4.28 / 3.2, 1.5),
  };

  function astranovOrbit(jd) {
    var days = jd - J2000;
    var M = wrap360(ASTRANOV.M0 + (360 / ASTRANOV.periodDays) * days) * DEG;
    var I = ASTRANOV.incl * DEG;
    var O = ASTRANOV.Omega * DEG;
    var r = ASTRANOV.visR;
    var x = r * (Math.cos(O) * Math.cos(M) - Math.sin(O) * Math.sin(M) * Math.cos(I));
    var y = r * (Math.sin(O) * Math.cos(M) + Math.cos(O) * Math.sin(M) * Math.cos(I));
    var z = r * (Math.sin(M) * Math.sin(I));
    var ll = equatorialToLatLng({ x: x, y: y, z: z }, jd);
    return { lat: ll.lat, lng: ll.lng, visR: r, periodDays: ASTRANOV.periodDays };
  }

  function snapshot(date) {
    var d = date || new Date();
    var jd = julianDay(d);
    var T = centuries(jd);
    var earth = helioEcliptic(PLANETS[2], T);
    var sunHelio = { x: 0, y: 0, z: 0 };
    var sunGeo = { x: -earth.x, y: -earth.y, z: -earth.z };
    var sunEq = eclipticToEquatorial(sunGeo.x, sunGeo.y, sunGeo.z, T);
    var sunLL = equatorialToLatLng(sunEq, jd);
    var sunDistAu = Math.sqrt(earth.x * earth.x + earth.y * earth.y + earth.z * earth.z);
    var moon = moonGeocentric(jd);
    var bodies = [];
    var i;
    for (i = 0; i < PLANETS.length; i++) {
      var p = PLANETS[i];
      if (p.id === 'earth') continue;
      var h = helioEcliptic(p, T);
      var gx = h.x - earth.x;
      var gy = h.y - earth.y;
      var gz = h.z - earth.z;
      var au = Math.sqrt(gx * gx + gy * gy + gz * gz);
      var eq = eclipticToEquatorial(gx, gy, gz, T);
      var ll = equatorialToLatLng(eq, jd);
      bodies.push({
        id: p.id,
        name: p.name,
        color: p.color,
        meshR: p.r,
        lat: ll.lat,
        lng: ll.lng,
        ra: ll.ra,
        dec: ll.dec,
        auFromEarth: au,
        auFromSun: h.r,
      });
    }
    var ast = astranovOrbit(jd);
    return {
      jd: jd,
      date: d.toISOString(),
      sun: {
        lat: sunLL.lat,
        lng: sunLL.lng,
        ra: sunLL.ra,
        dec: sunLL.dec,
        au: sunDistAu,
      },
      moon: moon,
      planets: bodies,
      astranov: ast,
      gmst: gmstDeg(jd),
    };
  }

  /** Compressed visual distance from Earth (scene units, Earth r = 1). */
  function visDistance(id, auFromEarth) {
    if (id === 'moon') return 3.2;
    if (id === 'astranov') return 4.28;
    if (id === 'sun') return 13.6;
    var au = Math.max(0.05, auFromEarth || 1);
    return 7.2 + 11.5 * Math.log10(1 + au * 6);
  }

  var _cache = null;
  var _cacheAt = 0;
  function now(date) {
    if (date) return snapshot(date);
    var t = Date.now();
    if (_cache && t - _cacheAt < 800) return _cache;
    _cache = snapshot();
    _cacheAt = t;
    return _cache;
  }

  global.SNEphemeris = {
    PLANETS: PLANETS,
    ASTRANOV: ASTRANOV,
    snapshot: snapshot,
    now: now,
    visDistance: visDistance,
    julianDay: julianDay,
    moon: function (d) {
      return moonGeocentric(julianDay(d));
    },
    sun: function (d) {
      return snapshot(d).sun;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
