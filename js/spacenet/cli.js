/* Astranov live activity CLI
 * Feed = your turn only · lines stream like a living terminal.
 * Map / globe depict what the system is doing (camera · pulse · routes).
 * No boot spam · no left-bar chat cards · no free-floating noise.
 */
(function (global) {
  'use strict';

  const hist = [];
  let histIdx = -1;
  const FEED_MAX = 120;
  let feedFilter = '';
  let stickBottom = true;
  /** >0 while handling user send — only then may feed write */
  let turnOpen = 0;
  let activityLabel = 'idle';

  function $(id) {
    return document.getElementById(id);
  }

  function setActivity(label) {
    activityLabel = String(label || 'idle').slice(0, 28);
    const el = $('cli-activity');
    if (el) el.textContent = activityLabel;
  }

  /** User-facing speech only — never engine names (Leaflet) or internal OS dumps */
  function userFace(text) {
    return String(text || '')
      .replace(/\bLeaflet\b/gi, 'map')
      .replace(/\bleaflet\b/gi, 'map')
      .replace(/\bOpenStreetMap\b/gi, 'street map')
      .replace(/\bOverpass\b/gi, 'map search')
      .replace(/\bOpenSky\b/gi, 'air traffic')
      .replace(/\bCarto\b/gi, 'map style')
      .replace(/\bSPACENET\b/g, 'Astranov')
      .replace(/\bSpaceNet\b/g, 'Astranov')
      .replace(/\bspacenet\b/g, 'astranov')
      .replace(/\bAlmighty crawl\b/gi, 'Looking around')
      .replace(/\bAlmighty\b/gi, 'Search')
      .replace(/\bEdge vendors upsert\b/gi, 'Shops found')
      .replace(/\bEdge vendors\b/gi, 'Shops')
      .replace(/\bfree mind\b/gi, 'me')
      .replace(/https?:\/\/[a-z0-9-]+\.supabase\.co[^\s]*/gi, 'astranov.eu')
      .replace(/\bsupabase(?:\.co)?\b/gi, 'astranov.eu')
      .replace(/\bSNGlobe\b/g, 'globe')
      .replace(/\bGIS path\b/gi, 'Google sign-in')
      .replace(/\bDB shops\b/gi, 'shops')
      .replace(/\b thrash\b/gi, '')
      // Kill junk categories that used to flood the feed
      .replace(/\bNigerian comedy films\b/gi, '')
      .replace(/\bd3-polygon\b/gi, '')
      .replace(/\bAtari\b/gi, '')
      .replace(/\s*[·]\s*/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /** Exact old training pin only — not the town of Rhodes. Real GPS is never fake. */
  var FAKE_DEMO = { lat: 36.4341, lng: 28.2176 };

  function isFakeDemoPin(lat, lng, meta) {
    if (lat == null || lng == null) return true;
    if (meta && (meta.real === true || /^(gps|locate|phys)/i.test(String(meta.source || ''))))
      return false;
    return Math.abs(Number(lat) - FAKE_DEMO.lat) < 0.0008 && Math.abs(Number(lng) - FAKE_DEMO.lng) < 0.0008;
  }

  function commitRealGps(row) {
    if (!row || row.lat == null) return row;
    try {
      global._snLastPos = {
        lat: row.lat,
        lng: row.lng,
        accuracy: row.accuracy,
        source: row.source || (row.fallback ? 'soft' : 'gps'),
        real: !row.fallback,
        t: Date.now(),
      };
      global._snPhysPos = {
        lat: row.lat,
        lng: row.lng,
        accuracy: row.accuracy,
        t: Date.now(),
        source: row.fallback ? row.source || 'soft' : 'gps',
        real: !row.fallback,
      };
      if (global.SNTasks && SNTasks.setPos) SNTasks.setPos(row.lat, row.lng);
      if (!row.fallback) {
        localStorage.setItem(
          'sn:last-good-gps',
          JSON.stringify({
            lat: row.lat,
            lng: row.lng,
            accuracy: row.accuracy,
            t: Date.now(),
            source: 'gps',
          })
        );
      }
    } catch (_) {}
    return row;
  }

  function readSoftPin() {
    // Soft only: verified pin / last REAL gps / last non-demo map pin
    try {
      var pref = global.SNMarket && SNMarket.loadPrefs && SNMarket.loadPrefs();
      if (pref && pref.verifiedLoc && pref.verifiedLoc.lat != null) {
        if (!isFakeDemoPin(pref.verifiedLoc.lat, pref.verifiedLoc.lng, pref.verifiedLoc)) {
          return {
            lat: pref.verifiedLoc.lat,
            lng: pref.verifiedLoc.lng,
            fallback: true,
            source: 'verified',
            reason: 'last verified delivery pin',
          };
        }
      }
    } catch (_) {}
    try {
      var g = JSON.parse(localStorage.getItem('sn:last-good-gps') || 'null');
      if (g && g.lat != null && g.lng != null && Date.now() - (g.t || 0) < 7 * 864e5) {
        if (!isFakeDemoPin(g.lat, g.lng, g)) {
          return {
            lat: g.lat,
            lng: g.lng,
            fallback: true,
            accuracy: g.accuracy,
            source: 'cache',
            reason: 'last good GPS',
          };
        }
      }
    } catch (_) {}
    try {
      var phys = global._snPhysPos;
      if (phys && phys.lat != null && !isFakeDemoPin(phys.lat, phys.lng, phys)) {
        return {
          lat: phys.lat,
          lng: phys.lng,
          fallback: true,
          accuracy: phys.accuracy,
          source: 'phys',
          reason: 'last physical fix',
        };
      }
    } catch (_) {}
    if (global._snLastPos && global._snLastPos.lat != null && !isFakeDemoPin(global._snLastPos.lat, global._snLastPos.lng, global._snLastPos)) {
      if (global._snLastPos.real || global._snLastPos.source === 'gps' || global._snLastPos.source === 'ip') {
        return {
          lat: global._snLastPos.lat,
          lng: global._snLastPos.lng,
          fallback: true,
          source: global._snLastPos.source || 'pin',
          reason: 'last map pin',
        };
      }
    }
    return { lat: null, lng: null, fallback: true, reason: 'unavailable' };
  }

  function browserGpsOnce(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!navigator.geolocation) {
        resolve({ ok: false, reason: 'unsupported' });
        return;
      }
      if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
        resolve({ ok: false, reason: 'insecure' });
        return;
      }
      var finished = false;
      var to = setTimeout(function () {
        if (finished) return;
        finished = true;
        resolve({ ok: false, reason: 'timeout' });
      }, opts.waitMs || 16000);
      try {
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            if (finished) return;
            finished = true;
            clearTimeout(to);
            resolve({
              ok: true,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              fallback: false,
              source: 'gps',
              reason: null,
            });
          },
          function (err) {
            if (finished) return;
            finished = true;
            clearTimeout(to);
            var code = err && err.code;
            resolve({
              ok: false,
              reason:
                code === 1 ? 'denied' : code === 2 ? 'unavailable' : code === 3 ? 'timeout' : 'error',
              code: code,
            });
          },
          {
            enableHighAccuracy: opts.high !== false,
            timeout: opts.timeout != null ? opts.timeout : 14000,
            maximumAge: opts.maximumAge != null ? opts.maximumAge : 0,
          }
        );
      } catch (e) {
        clearTimeout(to);
        resolve({ ok: false, reason: 'error' });
      }
    });
  }

  function browserGpsWatch(ms) {
    ms = ms || 10000;
    return new Promise(function (resolve) {
      if (!navigator.geolocation || !navigator.geolocation.watchPosition) {
        resolve({ ok: false, reason: 'unsupported' });
        return;
      }
      var done = false;
      var wid = null;
      var to = setTimeout(function () {
        if (done) return;
        done = true;
        try {
          if (wid != null) navigator.geolocation.clearWatch(wid);
        } catch (_) {}
        resolve({ ok: false, reason: 'timeout' });
      }, ms);
      try {
        wid = navigator.geolocation.watchPosition(
          function (pos) {
            if (done) return;
            done = true;
            clearTimeout(to);
            try {
              navigator.geolocation.clearWatch(wid);
            } catch (_) {}
            resolve({
              ok: true,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              fallback: false,
              source: 'gps-watch',
              reason: null,
            });
          },
          function (err) {
            // keep watching until timeout unless denied
            if (err && err.code === 1) {
              if (done) return;
              done = true;
              clearTimeout(to);
              try {
                navigator.geolocation.clearWatch(wid);
              } catch (_) {}
              resolve({ ok: false, reason: 'denied', code: 1 });
            }
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: ms }
        );
      } catch (e) {
        clearTimeout(to);
        resolve({ ok: false, reason: 'error' });
      }
    });
  }

  async function ipApproxLocate() {
    var endpoints = [
      {
        url: 'https://ipapi.co/json/',
        parse: function (j) {
          if (j && j.latitude != null && j.longitude != null)
            return { lat: Number(j.latitude), lng: Number(j.longitude), city: j.city, country: j.country_name };
          return null;
        },
      },
      {
        url: 'https://ipwho.is/',
        parse: function (j) {
          if (j && j.success !== false && j.latitude != null)
            return { lat: Number(j.latitude), lng: Number(j.longitude), city: j.city, country: j.country };
          return null;
        },
      },
      {
        url: 'https://get.geojs.io/v1/ip/geo.json',
        parse: function (j) {
          if (j && j.latitude != null && j.longitude != null)
            return {
              lat: Number(j.latitude),
              lng: Number(j.longitude),
              city: j.city,
              country: j.country,
            };
          return null;
        },
      },
    ];
    for (var i = 0; i < endpoints.length; i++) {
      try {
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var to = setTimeout(function () {
          try {
            if (ctrl) ctrl.abort();
          } catch (_) {}
        }, 4500);
        var res = await fetch(endpoints[i].url, {
          signal: ctrl ? ctrl.signal : undefined,
          credentials: 'omit',
          cache: 'no-store',
        });
        clearTimeout(to);
        if (!res || !res.ok) continue;
        var j = await res.json();
        var p = endpoints[i].parse(j);
        if (p && isFinite(p.lat) && isFinite(p.lng) && !isFakeDemoPin(p.lat, p.lng, p)) {
          return {
            ok: true,
            lat: p.lat,
            lng: p.lng,
            fallback: true,
            source: 'ip',
            reason: 'ip approx' + (p.city ? ' · ' + p.city : ''),
            city: p.city,
            accuracy: 5000,
          };
        }
      } catch (_) {}
    }
    return { ok: false, reason: 'ip unavailable' };
  }

  /**
   * Real locate pipeline:
   * 1) GPS high accuracy  2) GPS low accuracy  3) watch GPS  4) IP approx (soft)
   * Never returns Rhodes demo as "you".
   * Returns { lat, lng, fallback, reason?, accuracy?, source?, real? }
   */
  async function gpsLocate(opts) {
    opts = opts || {};
    try {
      log('Locate needs your pin for delivery and Earth. Allow location, or stay on the globe.', 'ok');
    } catch (_) {}
    var allowIp = opts.allowIp !== false;
    var allowSoft = opts.allowSoft !== false;

    var ipP = allowIp
      ? ipApproxLocate().catch(function () {
          return null;
        })
      : Promise.resolve(null);

    var r = await browserGpsOnce({ high: true, timeout: 5000, waitMs: 6000, maximumAge: 15000 });
    if (r.ok) return commitRealGps(r);

    r = await browserGpsOnce({ high: false, timeout: 4000, waitMs: 4500, maximumAge: 120000 });
    if (r.ok) return commitRealGps(r);

    if (r.reason !== 'denied' && r.reason !== 'insecure' && r.reason !== 'unsupported') {
      r = await browserGpsWatch(4000);
      if (r.ok) return commitRealGps(r);
    }

    var failReason = r.reason || 'unavailable';

    if (allowIp && failReason !== 'insecure') {
      try {
        var ip = await Promise.race([
          ipP,
          new Promise(function (res) {
            setTimeout(function () {
              res(null);
            }, 2500);
          }),
        ]);
        if (ip && ip.ok) {
          ip.fallback = true;
          ip.gpsFailed = failReason;
          commitRealGps(ip);
          return ip;
        }
      } catch (_) {}
    }

    // 5 soft cache — never demo Rhodes
    if (allowSoft) {
      var soft = readSoftPin();
      if (soft.lat != null) {
        soft.gpsFailed = failReason;
        return soft;
      }
    }

    return {
      lat: null,
      lng: null,
      fallback: true,
      reason: failReason,
      source: 'none',
    };
  }

  function setLive(on) {
    try {
      const panel = $('panel');
      if (panel) panel.classList.toggle('cli-live', !!on);
    } catch (_) {}
  }

  function beginTurn() {
    turnOpen++;
    setLive(true);
    setActivity('working');
    // Owner law: only peek mid if quiet; never force full expand; never > 1/3
    try {
      fitCliHeight();
    } catch (_) {}
  }

  function endTurn() {
    turnOpen = Math.max(0, turnOpen - 1);
    if (turnOpen === 0) {
      setLive(false);
      setActivity('idle');
    }
  }

  function inTurn() {
    return turnOpen > 0;
  }

  /**
   * Depict CLI activity on map / globe — the world is the UI.
   * kind: locate|fly|shops|order|delivery|global|city|food|pulse|work
   */
  function depict(kind, opts) {
    opts = opts || {};
    const G = global.SNGlobe;
    const M = global.SNMap;
    const pos =
      opts.lat != null
        ? { lat: Number(opts.lat), lng: Number(opts.lng) }
        : global._snLastPos ||
          (global.SNTasks && SNTasks.pos) ||
          (G && G.focusPos && G.focusPos()) ||
          null;
    try {
      if (kind === 'locate' || kind === 'pulse') {
        // Stay local: open city map at you — do NOT fly globe around the planet
        if (pos && M && M.open) void M.open(pos.lat, pos.lng);
        if (pos && M && M.markYou) try { M.markYou(pos.lat, pos.lng, opts.label || 'YOU'); } catch (_) {}
        if (pos && G && G.pulse) G.pulse(pos.lat, pos.lng, 0x3d9eff, opts.label || 'You', 8000);
        // Only soft-focus if already on globe and nearby — never national world tour
        if (pos && G && G.flyNear && opts.allowGlobe === true) {
          G.flyNear(pos.lat, pos.lng, opts.tier || 'city');
        }
        if (G && G.setHud) G.setHud(opts.label || 'Locate');
        setActivity(kind === 'locate' ? 'locate' : 'pulse');
        return;
      }
      if (kind === 'global') {
        if (G && G.goToTier) G.goToTier('global');
        if (M && M.close) M.close();
        if (G && G.setHud) G.setHud('GLOBAL Earth');
        setActivity('global');
        return;
      }
      if (kind === 'city' || kind === 'map') {
        if (pos && M && M.open) void M.open(pos.lat, pos.lng);
        if (G && G.setHud) G.setHud(opts.label || 'City map');
        setActivity('city');
        return;
      }
      if (kind === 'fly' || kind === 'go') {
        if (pos && G && G.goToPlace) {
          G.goToPlace(pos.lat, pos.lng, {
            tier: opts.tier || 'national',
            body: opts.body || 'earth',
            pulse: true,
            label: opts.label || '',
            openMap: !!opts.openMap,
          });
        } else if (pos && G && G.flyNear) {
          G.flyNear(pos.lat, pos.lng, opts.tier || 'national');
        }
        if (G && G.setHud) G.setHud(opts.label || 'Fly');
        setActivity('fly');
        return;
      }
      if (kind === 'shops' || kind === 'food' || kind === 'vendors') {
        if (pos && G && G.goToPlace) {
          G.goToPlace(pos.lat, pos.lng, {
            tier: 'city',
            body: 'earth',
            pulse: true,
            label: opts.label || 'Vendors',
            openMap: true,
          });
        } else if (pos && M && M.open) {
          void M.open(pos.lat, pos.lng);
        }
        if (M && M.showProfiles) M.showProfiles();
        if (pos && G && G.pulse) G.pulse(pos.lat, pos.lng, 0xffcc44, opts.label || 'Shop', 16000);
        if (G && G.setHud) G.setHud(opts.label || 'Shops');
        setActivity(kind === 'food' ? 'food' : 'shops');
        return;
      }
      if (kind === 'order' || kind === 'delivery' || kind === 'tasks') {
        if (pos && M && M.open) void M.open(pos.lat, pos.lng);
        if (M && M.showTasks) M.showTasks();
        if (M && M.showProfiles) M.showProfiles();
        try {
          if (global.SNField && SNField.refreshRoutes) void SNField.refreshRoutes(true);
        } catch (_) {}
        if (pos && G && G.pulse) G.pulse(pos.lat, pos.lng, 0x00dcff, opts.label || 'Route', 18000);
        if (G && G.setHud) G.setHud(opts.label || 'Delivery');
        setActivity(kind === 'order' ? 'order' : 'route');
        return;
      }
      if (kind === 'work') {
        setActivity(opts.label || 'work');
        if (G && G.setHud) G.setHud(opts.label || 'Working…');
        return;
      }
    } catch (e) {
      console.warn('[SNCli.depict]', e);
    }
  }

  /** Stream a progress line + optional map depict in one call */
  function activity(text, mapKind, mapOpts) {
    if (mapKind) depict(mapKind, mapOpts || {});
    if (text) {
      setActivity(String(text).slice(0, 24));
      preview(text);
      return log(text, 'dim');
    }
    return null;
  }

  function feedBox() {
    const box = $('cli-log');
    if (!box) return null;
    try {
      const strip = $('cli-tile-strip');
      if (strip) strip.remove();
      const exp = $('cli-tile-expand');
      if (exp) exp.remove();
    } catch (_) {}
    let hint = $('cli-feed-search-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'cli-feed-search-hint';
      box.insertBefore(hint, box.firstChild);
    }
    if (!box._snFeedBound) {
      box._snFeedBound = true;
      box.addEventListener(
        'scroll',
        () => {
          stickBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
        },
        { passive: true }
      );
    }
    return box;
  }

  function trimFeed(box) {
    if (!box) return;
    while (box.children.length > FEED_MAX + 2) {
      const n = box.children[1] || box.firstChild;
      if (n && n.id === 'cli-feed-search-hint') {
        if (box.children[2]) box.removeChild(box.children[2]);
        else break;
      } else if (n) box.removeChild(n);
      else break;
    }
  }

  function scrollFeedToEnd(box) {
    if (!box || !stickBottom || feedFilter) return;
    box.scrollTop = box.scrollHeight;
  }

  function applyFeedFilter(q) {
    const box = feedBox();
    if (!box) return 0;
    feedFilter = String(q || '')
      .trim()
      .toLowerCase()
      .replace(/^[/？?]\s*/, '')
      .replace(/^search\s+/i, '');
    const hint = $('cli-feed-search-hint');
    let n = 0;
    if (!feedFilter) {
      box.classList.remove('filtering');
      if (hint) hint.textContent = '';
      box.querySelectorAll('.cli-feed-item').forEach((el) => el.classList.remove('match'));
      return 0;
    }
    box.classList.add('filtering');
    box.querySelectorAll('.cli-feed-item').forEach((el) => {
      const hay = (el.getAttribute('data-search') || el.textContent || '').toLowerCase();
      const ok = hay.indexOf(feedFilter) >= 0;
      el.classList.toggle('match', ok);
      if (ok) n++;
    });
    if (hint) {
      hint.textContent =
        n > 0
          ? 'Search · “' + feedFilter + '” · ' + n + ' · clear input to exit'
          : 'Search · “' + feedFilter + '” · no matches · clear input to exit';
    }
    return n;
  }

  /**
   * Live stream line — ONLY during user turn (or force).
   * No card chrome · map may already be moving via depict().
   */
  function inferCmd(text) {
    const t = String(text || '')
      .replace(/^>\s*/, '')
      .trim()
      .toLowerCase();
    if (!t || t.length > 48) return '';
    if (/^enter(\s+astranov)?$/.test(t) || t === 'go') return 'enter astranov';
    if (/^locate/.test(t)) return 'locate';
    if (/^first (delivery|loop|order)/.test(t)) return 'first delivery';
    if (t === 'wallet' || t === 'rate') return t;
    if (/^shops/.test(t)) return 'shops';
    if (/^donate on/.test(t)) return 'donate on';
    if (/^power on/.test(t)) return 'power on';
    if (t === 'help') return 'help';
    if (t === 'battery' || t === 'heat' || t === 'device' || t === 'status') return t === 'heat' ? 'battery' : t;
    if (/^network/.test(t)) return 'network';
    if (/^hard boot|^purge|^clear cache/.test(t)) return 'hard boot';
    if (/^repair/.test(t)) return 'repair display';
    return '';
  }

  /** Noise filter — machine chatter never enters the CLI */
  function isNoiseLine(text, cls) {
    const t = String(text || '');
    if (!t.trim()) return true;
    if (cls === 'noise' || cls === 'debug' || cls === 'trace') return true;
    // Drop raw stack / module spam
    if (/^\[SN|TypeError|undefined is not|Failed to load|CORS|net::ERR/i.test(t)) return true;
    if (/loading module|webpack|vite|hydration|devtools/i.test(t)) return true;
    if (/\[ OK \]|\[FAIL\]|\[WARN\]|\[FIX \]|\[....\]|STAGE ·|HANDOFF ·|load \w+\.js/i.test(t)) return true;
    if (/═{3,}/.test(t)) return true;
    if (/^theme\b/i.test(t.trim())) return true;
    if (/XAI_API_KEY|paid mind|key stays on the server|Architect ·|Architect confirmed/i.test(t))
      return true;
    if (/USAGE SHIP|ASTRANOV LAW|Push main|owner_note|Bridge IN · owner|openHandoffs|js\/spacenet\/\* only/i.test(t))
      return true;
    if (/Name a place|Talk · locate|Command the HUD|Heads up display command/i.test(t))
      return true;
    if (/Recommendations must obey/i.test(t)) return true;
    return false;
  }

  function usefulLineCount() {
    const box = feedBox();
    if (!box) return 0;
    return box.querySelectorAll('.cli-feed-item').length;
  }

  function fitCliHeight() {
    try {
      if (global.SNUi && typeof SNUi.fitCliToContent === 'function') {
        SNUi.fitCliToContent(usefulLineCount());
        return;
      }
    } catch (_) {}
  }

  /**
   * Live stream line.
   * force=true or cls='ops'/'err'/'cmd' may write outside a turn (app health / driver events).
   * No machine noise. Fit CLI height after write.
   */
  function log(text, cls, force) {
    if (isNoiseLine(text, cls)) return null;
    const allowOutside =
      !!force || cls === 'err' || cls === 'ops' || cls === 'cmd' || cls === 'health';
    if (!allowOutside && !inTurn()) {
      if (cls === 'err') {
        try {
          preview(String(text || '').slice(0, 90));
        } catch (_) {}
      }
      return null;
    }
    const box = feedBox();
    if (!box) return null;
    box.querySelectorAll('.cli-feed-item.is-latest').forEach((el) => {
      el.classList.remove('is-latest');
    });
    const wrap = document.createElement('div');
    wrap.className = 'cli-feed-item is-latest';
    if (cls === 'dim' || cls === 'progress') wrap.classList.add('cli-act');
    if (cls === 'ops' || cls === 'health') wrap.classList.add('cli-ops');
    const line = document.createElement('div');
    let kind = cls || 'ok';
    if (cls === 'dim') kind = 'progress';
    if (cls === 'ops' || cls === 'health') kind = 'ok';
    line.className = 'cli-line' + (kind ? ' ' + kind : '');
    const face = userFace(text);
    const body = document.createElement('div');
    body.className = 'cli-body';
    body.textContent = face;
    line.appendChild(body);
    wrap.appendChild(line);
    wrap.setAttribute('data-search', String(face || ''));
    const cmd = inferCmd(face);
    if (cmd) {
      wrap.setAttribute('data-cmd', cmd);
      wrap.title = 'Tap to run · ' + cmd;
      wrap.addEventListener('click', function () {
        try {
          run(cmd);
        } catch (_) {}
      });
    }
    if (feedFilter) {
      wrap.classList.toggle(
        'match',
        String(face || '')
          .toLowerCase()
          .indexOf(feedFilter) >= 0
      );
    }
    box.appendChild(wrap);
    trimFeed(box);
    scrollFeedToEnd(box);
    if (cls === 'ok' || cls === 'cmd' || cls === 'ops' || cls === 'health')
      preview(String(face || '').slice(0, 90));
    try {
      fitCliHeight();
    } catch (_) {}
    return wrap;
  }

  /** Useful app-status line (health, delivery, checks) — not debug */
  function ops(text) {
    return log(String(text || '').slice(0, 160), 'ops', true);
  }

  /** Dead API — tiles never inject into CLI (map multi-tile only) */
  function appendTilePost() {
    return null;
  }

  function preview(text) {
    const face = userFace(text);
    const el = $('cli-preview');
    if (el) el.textContent = face || '';
    try {
      if (global.SNGlobe?.setHud) SNGlobe.setHud(String(face || '').slice(0, 72));
    } catch (_) {}
  }

  function help() {
    log('Name a place, a thing, or an order.', 'ok');
    log('> tokyo', 'cmd');
    log('> pizza', 'cmd');
    log('> what is astranov', 'cmd');
    var debug = false;
    try {
      debug =
        /(?:\?|&)sn-debug=1\b/.test(location.search || '') ||
        !!(global.SNAuth && SNAuth.isOwner && SNAuth.isOwner());
    } catch (_) {}
    if (debug) {
      log('> eiffel tower', 'cmd');
      log('> drum cam at sticky fingers', 'cmd');
    }
    preview('place · thing · order');
  }

  function closeBrief() {
    try {
      var el = document.getElementById('sn-brief-sheet');
      if (el) el.remove();
    } catch (_) {}
  }

  function ensureShakeStyle() {
    if (document.getElementById('sn-shake-css')) return;
    var s = document.createElement('style');
    s.id = 'sn-shake-css';
    s.textContent =
      '@keyframes snEarthShake{0%,100%{transform:translate3d(0,0,0)}12%{transform:translate3d(-11px,6px,0) rotate(-0.35deg)}26%{transform:translate3d(10px,-5px,0) rotate(0.3deg)}40%{transform:translate3d(-7px,4px,0)}58%{transform:translate3d(6px,-3px,0)}76%{transform:translate3d(-3px,2px,0)}}' +
      '.sn-shaking{animation:snEarthShake .72s cubic-bezier(.36,.07,.19,.97) both}';
    document.head.appendChild(s);
  }

  function shakeEarth() {
    ensureShakeStyle();
    var nodes = [document.getElementById('globe'), document.body];
    nodes.forEach(function (n) {
      if (!n) return;
      n.classList.remove('sn-shaking');
      void n.offsetWidth;
      n.classList.add('sn-shaking');
      setTimeout(function () {
        try {
          n.classList.remove('sn-shaking');
        } catch (_) {}
      }, 800);
    });
  }

  function openVodiBrief() {
    closeBrief();
    var wrap = document.createElement('div');
    wrap.id = 'sn-brief-sheet';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Vodi restoration');
    wrap.style.cssText =
      'position:fixed;left:8px;right:8px;top:8px;bottom:76px;z-index:160;' +
      'background:#03070f;border:1px solid rgba(61,158,255,.42);border-radius:16px;' +
      'overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,.55)';
    var x = document.createElement('button');
    x.type = 'button';
    x.textContent = 'close';
    x.style.cssText =
      'position:absolute;top:8px;right:8px;z-index:2;height:32px;padding:0 14px;' +
      'border:1px solid rgba(61,158,255,.45);background:#061028;color:#e8eeff;' +
      'border-radius:999px;font:600 12px Inter,system-ui,sans-serif';
    x.addEventListener('click', closeBrief);
    var frame = document.createElement('iframe');
    frame.title = 'Vodi restoration';
    frame.style.cssText = 'width:100%;height:100%;border:0;background:#03070f';
    wrap.appendChild(frame);
    wrap.appendChild(x);
    document.body.appendChild(wrap);
    fetch('/briefings/vodi?v=20260814053000-vodi', { cache: 'no-store' })
      .then(function (r) {
        return r.text();
      })
      .then(function (html) {
        if (html && /RODOS ISLAND RESTORATION/i.test(html)) {
          frame.srcdoc = html;
        } else {
          frame.src = '/briefings/vodi?v=20260814053000-vodi';
        }
      })
      .catch(function () {
        frame.src = '/briefings/vodi?v=20260814053000-vodi';
      });
  }

  function looksLikeWorldSearch(low, line) {
    var t = String(low || '');
    if (t.length < 2 || t.length > 80) return false;
    if (/\?$/.test(String(line || '').trim())) return false;
    if (/^(what|who|why|how|when|which|weather|tell me|explain|define)\b/i.test(t)) return false;
    if (
      /^(help|locate|login|wallet|rate|mine|donate|layers|order|deliver|drive|task|code|coders|research|pizza|shops|vendors|hard boot|first delivery|play|games|youtube|yt|watch|clip)\b/.test(
        t
      )
    )
      return false;
    if (/\b(in|at|near|around)\s+([a-zα-ω][\wα-ω'\-]*)/i.test(line)) {
      var placeTok = (RegExp.$2 || '').toLowerCase();
      if (
        CITIES[placeTok] ||
        /^(tokyo|paris|london|athens|rhodes|rodos|rome|mars|earth|moon)$/.test(placeTok)
      )
        return true;
    }
    if (
      /\b(earth|mars|moon|jupiter|saturn|venus|city|island|tower|harbour|harbor|beach|port|airport|mountain|cape|temple|bridge|square|plaza)\b/.test(
        t
      )
    ) {
      if (/\b(drum\s*cam|concert|setlist|youtube|clip|video)\b/.test(t)) return false;
      return true;
    }
    try {
      if (CITIES[t.replace(/\s+/g, '')] || CITIES[t]) return true;
    } catch (_) {}
    if (/^[A-ZΑ-Ω][\wα-ω'’\-]+(\s+[A-ZΑ-Ω][\wα-ω'’\-]+){0,3}$/.test(String(line || '').trim())) {
      try {
        if (global.SNYoutube && SNYoutube.looksLikeClipTitle && SNYoutube.looksLikeClipTitle(line)) return false;
      } catch (_) {}
      return true;
    }
    return false;
  }

  function isVodiResearch(s) {
    var t = String(s || '').toLowerCase();
    if (/\b(vodi|βόδι|βιολογικ|viologik)\b/.test(t)) return true;
    if (/\b(restoration|waste.to.resource)\b/.test(t)) return true;
    if (
      /\b(pollution|ρύπανσ|λύματα|sewage|fecal|kopranod)\b/.test(t) &&
      /\b(rhodes|rodos|ρόδο|vodi|βόδι)\b/.test(t)
    )
      return true;
    if (/shit/.test(t) && /\b(sea|θάλασσ|vodi|βόδι)\b/.test(t)) return true;
    if (/zoom to vodi|fly vodi|go to vodi/.test(t)) return true;
    return false;
  }

  async function runVodiResearch(line) {
    var raw = String(line || '');
    var wantImg = !raw || /sat|imager|real[\s-]?time|live|pollut|chlor|sea|θάλασσ|show/i.test(raw);
    activity('Vodi satellite…', 'work', { label: 'Vodi' });
    try {
      if (global.SNGlobe && SNGlobe.goToPlace) {
        SNGlobe.goToPlace(36.38689, 28.24717, {
          tier: 'city',
          label: 'Vodi',
          body: 'earth',
          pulse: true,
          openMap: false,
        });
      }
    } catch (_) {}
    try {
      if (global.SNMap && SNMap.showLiveSat) {
        await SNMap.showLiveSat(36.38689, 28.24717, {
          zoom: 12,
          pollution: true,
          trueColor: true,
          plume: true,
          label: 'VODI · plant',
        });
      } else if (global.SNMap && SNMap.open) {
        await SNMap.open(36.38689, 28.24717, { force: true, imagery: true, basemap: 'satellite' });
        if (global.SNMap.markYou) SNMap.markYou(36.38689, 28.24717, 'VODI · plant');
      }
    } catch (_) {}
    shakeEarth();
    log('Vodi · cape by Koskinou. The island sewage plant. 36.387 N, 28.247 E', 'ok');
    log('Coast Guard, June–July 2026: human gut bacteria in the sea. Dirty patch about 150 by 300 metres.', 'ok');
    if (wantImg) {
      log('You asked for the sea. This is the last NASA pass plus chlorophyll — not a street map.', 'ok');
      preview('Vodi · live sat');
      return;
    }
    openVodiBrief();
    log('The island flinched. That stain is 150 by 300 metres of us.', 'ok');
    log('Plant over 90% full. Tanker dumps stopped 13 August. Appointment only: 22410 45300', 'ok');
    log('Plan: cook sludge for plant power and park compost. Trash to benches. Rubble to sidewalks.', 'ok');
    log('Brief is open. Close it when you have read it.', 'dim');
    preview('Vodi · restoration brief');
  }

  function moneyStatus() {
    const C = global.SNCurrency;
    if (!C) {
      log('Currency offline', 'err');
      return;
    }
    (C.status?.() || ['S primary']).forEach((ln) =>
      log(ln, /PRIMARY|Wallet|secondary|Fees/i.test(ln) ? 'ok' : 'dim')
    );
    preview('S ' + (C.format?.(C.balance?.() || 0) || '') + ' · index ' + (C.networkIndex?.()?.toFixed?.(4) || '?'));
  }

  function dumpBrain(mode) {
    const B = global.SNBrain;
    if (!B) {
      log('Brain offline — js/spacenet/brain.js missing', 'err');
      return;
    }
    if (mode === 'verify') {
      const v = B.verify();
      log(v.ok ? '── Brain VERIFY OK ──' : '── Brain VERIFY FAIL ──', v.ok ? 'ok' : 'err');
      (v.checks || []).forEach((c) => {
        log((c.pass ? '✓ ' : '✗ ') + c.id + (c.detail ? ' · ' + c.detail : ''), c.pass ? 'ok' : 'err');
      });
      preview(v.ok ? 'Brain OK · ' + v.build : 'Brain FAIL');
      return;
    }
    const lines = mode === 'law' ? B.lawLines() : B.summaryLines();
    lines.forEach((ln) => log(ln, /✗|FAIL|WHY/.test(ln) ? 'dim' : 'ok'));
    preview('Astranov Brain · type verify');
  }

  const CITIES = {
    athens: [37.9838, 23.7275],
    rhodes: [36.4341, 28.2176],
    rodos: [36.4341, 28.2176],
    london: [51.5074, -0.1278],
    paris: [48.8566, 2.3522],
    berlin: [52.52, 13.405],
    rome: [41.9028, 12.4964],
    newyork: [40.7128, -74.006],
    tokyo: [35.6762, 139.6503],
    dubai: [25.2048, 55.2708],
    starbase: [25.997, -97.156],
  };

  function isOsCommand(raw) {
    var s = String(raw || '').trim();
    if (!s) return false;
    return /^(locate|fly|go|pizza|order|poly|polygon|layers|call|login|wallet|help|hud|quiet|prefs?|scenarios?|village|kalithea|kallithea|marina|boot|diag|diagnostics|repair|plans?|subscribe|donate|power|helper|hard boot|clear cache|enter|youtube|yt|watch|skin|shape|reshape|evolve|live|fluid|city|national|regional|shops|vendors)\b/i.test(
      s
    );
  }

  function looksLikeTalk(raw) {
    return !isOsCommand(raw);
  }

  async function grokFetch(line) {
    var cfg = global.SN_CONFIG || {};
    var sb = String(cfg.sbUrl || 'https://lkoatrkhuigdolnjsbie.supabase.co').replace(/\/$/, '');
    var key = cfg.sbKey || '';
    var headers = { 'Content-Type': 'application/json' };
    if (key) {
      headers.apikey = key;
      headers.Authorization = 'Bearer ' + key;
    }
    try {
      if (global.SNAuth && SNAuth.authHeaders) {
        var h = await SNAuth.authHeaders();
        Object.keys(h).forEach(function (k) {
          headers[k] = h[k];
        });
      }
    } catch (_) {}
    var body = JSON.stringify({
      message: String(line || '').slice(0, 4000),
      mode: 'chat',
      allow_paid: true,
      gift: true,
      force_paid: true,
    });
    var urls = [];
    try {
      urls.push(location.origin + '/api/ai');
    } catch (_) {}
    urls.push(sb + '/functions/v1/aicycle');
    var text = '';
    var via = '';
    for (var i = 0; i < urls.length && !text; i++) {
      try {
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var t = setTimeout(function () {
          try {
            if (ctrl) ctrl.abort();
          } catch (_) {}
        }, 18000);
        var r = await fetch(urls[i], { method: 'POST', headers: headers, body: body, signal: ctrl ? ctrl.signal : undefined });
        clearTimeout(t);
        var j = await r.json().catch(function () {
          return {};
        });
        var cand = String(j.text || j.response || j.message || '').trim();
        if (/paid XAI also failed|free tier unavailable|Three tastes are done/i.test(cand)) cand = '';
        if (cand) {
          text = cand;
          via = String(j.via || j.provider || 'grok');
        }
      } catch (_) {}
    }
    return { text: text, via: via };
  }

  async function talkToMind(line) {
    log('GROK', 'dim');
    var got = { text: '', via: '' };
    try {
      got = await grokFetch(line);
    } catch (_) {}
    var reply = String((got && got.text) || '').trim();
    if (!reply) {
      try {
        if (global.SNSearch && SNSearch.researchFirst) {
          await SNSearch.researchFirst(line, { log: log, preview: preview, skipBrain: true });
          return true;
        }
      } catch (_) {}
      log('Grok did not answer. Say it again.', 'err');
      return true;
    }
    var spoken = reply
      .replace(/\[\[(GO|FLY|YOUTUBE|IMAGINE):[^\]]+\]\]/gi, '')
      .replace(/^FLY:\s*[^\n]+/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (spoken) log(spoken, 'ok');
    try {
      var go = reply.match(/\[\[(?:GO|FLY):([^\]]+)\]\]/i) || reply.match(/FLY:\s*([^\n.]+)/i);
      if (go && go[1] && global.SNSearch && SNSearch.geocode) {
        var hits = await SNSearch.geocode(String(go[1]).trim());
        if (hits && hits[0] && global.SNGlobe && SNGlobe.goToPlace) {
          SNGlobe.goToPlace(hits[0].lat, hits[0].lng, {
            tier: 'regional',
            pulse: true,
            color: 0x14c3f3,
            label: String(hits[0].name || go[1]).slice(0, 18),
            openMap: false,
          });
        }
      }
      var yt = reply.match(/\[\[YOUTUBE:([^\]]+)\]\]/i);
      if (yt && yt[1] && global.SNYoutube && SNYoutube.find) await SNYoutube.find(String(yt[1]).trim());
    } catch (_) {}
    try {
      if (global.SNHelper && SNHelper.speakDeep) SNHelper.speakDeep(spoken.slice(0, 180));
      else if (typeof replyOut === 'function') replyOut(spoken);
    } catch (_) {}
    return true;
  }

  async function run(raw) {
    let line = String(raw || '').trim();
    if (!line) return;
    try {
      beginTurn();
      log(line, 'cmd');
      preview(line.slice(0, 48));
    } catch (_) {}
    try {
      if (global.SNChromeFix && SNChromeFix.handleLine && SNChromeFix.handleLine(line)) return true;
    } catch (_) {}
    try {
      if (global.SNWebRTC && SNWebRTC.handleLine && SNWebRTC.handleLine(line)) return true;
    } catch (_) {}
    try {
      if (global.SNChromeFix && SNChromeFix.demandHud) SNChromeFix.demandHud('type');
    } catch (_) {}
    try {
      if (global.SNStage && SNStage.scan && !/^(what|who|why|how|when|which)\b/i.test(line) && !/\?$/.test(line))
        SNStage.scan(line.slice(0, 28));
    } catch (_) {}
    try {
      if (global.SNScenarios && SNScenarios.handleLine && SNScenarios.handleLine(line)) return true;
    } catch (_) {}
    try {
      if (global.SNPrefs && SNPrefs.handleLine && SNPrefs.handleLine(line)) return true;
    } catch (_) {}
    try {
      if (global.SNCurrency && SNCurrency.handleLine && SNCurrency.handleLine(line)) return true;
    } catch (_) {}
    try {
      if (global.SNVillage && SNVillage.handleLine && SNVillage.handleLine(line)) return true;
    } catch (_) {}
    try {
      if (global.SNFluid && SNFluid.isWish && SNFluid.isWish(line)) {
        await SNFluid.wish(line);
        return true;
      }
    } catch (_) {}
    try {
      if (looksLikeTalk(line)) {
        await talkToMind(line);
        return true;
      }
    } catch (_) {}
    // AI subscription plans
      try {
        if (global.SNSubscription && SNSubscription.handleLine) {
          const subHit = await SNSubscription.handleLine(line);
          if (subHit) return true;
        }
      } catch (_) {}
      // Dynamic OS will (every user is a developer)
      try {
        if (global.SNOsWill && SNOsWill.handleLine) {
          const willHit = await SNOsWill.handleLine(line);
          if (willHit) return true;
        }
      } catch (_) {}
      // Owner test commands FIRST (before dialect rewrites "demo delivery" → deliver)
    try {
      const rawLow = line.toLowerCase();
      if (global.SNOfferStack && typeof SNOfferStack.handleLine === 'function') {
        const offerKeys =
          /^(offers?|tiles?|throw tiles|launch tiles|demo delivery|demo route|demo full|full demo|test tiles|test offers|test delivery|test polygons?|test poly|poly test|polygon|moving driver|driver on route|clear offers|clear tiles|clear routes|clear polygons|clear all|routes|radar|refresh routes|test harness|demo all|test all|offers help|test help|help offers|task complete|complete task|finish task|offers complete|complete offer)\b/i;
        if (offerKeys.test(rawLow) || /^(do|run|launch|start)\s+(tiles|offers|polygon|demo|delivery)/i.test(rawLow)) {
          beginTurn();
          hist.push(line);
          histIdx = hist.length;
          log(line, 'cmd');
          try {
            const handled = await SNOfferStack.handleLine(line);
            if (handled) return;
          } catch (eOff) {
            log('Offers · ' + (eOff && eOff.message ? eOff.message : eOff), 'err');
            return;
          }
        }
      }
    } catch (_) {}
    // GAME MODES before dialect (prevents "earth ops" → earth tier rewrite)
    try {
      const gLow = line.toLowerCase();
      const isGame =
        /^(earth\s*ops|earthops|ops|play\s*levels?|levels?|gaming|game\s*mode|orbital|high\s*end|space\s*scene|orbit(\s*game)?|space\s*ops|invaders|space\s*invaders|play\s*invaders|cockpit|space\s*war|arcade|play\s*game|start\s*game|game|play|games|game\s*help|play\s*help|invaders\s*close|close\s*game|game\s*off|ops\s*close|earth\s*ops\s*close|close\s*ops|space\s*scene\s*exit|exit\s*scene|stop\s*orbit)\b/i.test(
          gLow
        ) || /^(play|start)\s+(levels?|ops|earth|space|orbit|the\s+)?(game|invaders|cockpit|levels?|scene)/i.test(gLow);
      if (isGame) {
        beginTurn();
        hist.push(line);
        histIdx = hist.length;
        log(line, 'cmd');
        try {
          if (
            /^(earth\s*ops|earthops|ops|play\s*levels?|levels?|gaming|game\s*mode|orbital|high\s*end|space\s*scene|orbit(\s*game)?|space\s*ops)\b/i.test(gLow) ||
            /^(play|start)\s+(levels?|ops|earth|space|orbit)/i.test(gLow)
          ) {
            try {
              if (global.SNLoader?.ensure) await SNLoader.ensure(['spacescene', 'space-scene', 'earthops', 'helper', 'gaming', 'ops']);
            } catch (_) {}
            const E = global.SNSpaceScene || global.SNEarthOps;
            if (!E) {
              log('Space scene loading · hard refresh', 'err');
              return;
            }
            E.mount?.();
            E.start?.() || E.open?.();
            log('SPACE SCENE · real Earth + outer space ARE the theater', 'ok');
            log('WASD fly · Space fire · Esc exit · orbit beacons · levels Athens → Lunar', 'dim');
            preview('space scene');
            return;
          }
          if (
            /^(invaders|space\s*invaders|play\s*invaders|cockpit|space\s*war|arcade|play\s*game|start\s*game|game)\b/i.test(
              gLow
            ) ||
            /^(play|start)\s+(the\s+)?(game|invaders|cockpit)/i.test(gLow)
          ) {
            try {
              if (global.SNLoader?.ensure) await SNLoader.ensure(['invaders', 'game']);
            } catch (_) {}
            const I = global.SNInvaders;
            if (!I) {
              log('Invaders loading · hard refresh', 'err');
              return;
            }
            I.init?.();
            I.open?.() || I.start?.();
            log('INVADERS · cockpit · tilt/arrows · guns lasers missiles', 'ok');
            preview('invaders');
            return;
          }
          if (/close|off/.test(gLow)) {
            try { global.SNInvaders?.close?.(); } catch (_) {}
            try { if (global.SNSpaceScene) { SNSpaceScene.stop?.(); SNSpaceScene.close?.(); } } catch (_) {}
            try { global.SNEarthOps?.close?.(); } catch (_) {}
            log('Game modes closed · Earth online', 'dim');
            preview('Earth');
            return;
          }
          if (gLow === 'play' || gLow === 'games' || gLow === 'game help' || gLow === 'play help') {
            [
              '═══ ASTRANOV GAME MODES ═══',
              'helper · silver-wing SpaceX Bot',
              'helper patrol · wing sweep',
              'space scene · Earth + outer space theater',
              'invaders · cockpit arcade',
              'ops close · leave theater',
            ].forEach((ln, i) => log(ln, i ? 'dim' : 'ok'));
            preview('games');
            return;
          }
        } catch (eG) {
          log('Game · ' + (eG && eG.message ? eG.message : eG), 'err');
          return;
        }
      }
    } catch (_) {}
    // Astranov Mind — Archangelos / Greeklish before routing
    // Keep exact operating phrases intact — dialect maps "delivery" → deliver me
    try {
      var keepRaw = String(line || '').toLowerCase().trim();
      var keepExact = {
        'first delivery': 1,
        'first loop': 1,
        'first order': 1,
        'πρώτη παράδοση': 1,
        pizza: 1,
        'order pizza': 1,
        'order me pizza': 1,
        'order me a pizza': 1,
        πίτσα: 1,
        shops: 1,
        vendors: 1,
        stores: 1,
        wallet: 1,
        'donate on': 1,
        'donate off': 1,
        'hard boot': 1,
        help: 1,
        vodi: 1,
        βόδι: 1,
        restoration: 1,
        search: 1,
        visualize: 1,
        omma: 1,
        όμμα: 1,
        live: 1,
        fluid: 1,
        fly: 1,
        spacexai: 1,
        'live on': 1,
        'live off': 1,
        'live now': 1,
      };
      if (!keepExact[keepRaw] && !/^(search|find|show me|zoom to|visualize|look at|take me to)\b/.test(keepRaw)) {
        if (global.ArcangeloDialect && ArcangeloDialect.normalizeForRouting) {
          const n = ArcangeloDialect.normalizeForRouting(line);
          if (n) line = n;
        }
      }
    } catch (_) {}
    // /query or ?query → filter the CLI feed only. "search tokyo" is Earth.
    if (/^[/？?]/.test(line)) {
      const q = line.replace(/^[/？?]\s*/, '');
      if (!q) {
        applyFeedFilter('');
        preview('Search off');
        return;
      }
      const n = applyFeedFilter(q);
      preview(n + ' match · clear / to exit');
      return;
    }
    beginTurn();
    hist.push(line);
    histIdx = hist.length;
    if (feedFilter) applyFeedFilter('');
    if (global._snVoiceSaid && global._snVoiceSaid === line) {
      global._snVoiceSaid = '';
    } else {
      log(line, 'cmd');
    }
    global.SNRibbon?.infer?.(line);

    const low = line.toLowerCase();
    const Tasks = global.SNTasks;
    const Globe = global.SNGlobe;

    if (/^(what('s| is)?|who is|explain)\s+astranov\b|^astranov\??$/.test(low)) {
      log(
        'Astranov is SpaceNet — the internet depicted in space. Research, calls, and orders are hops on Earth, not a list of links.',
        'ok'
      );
      preview('Astranov · SpaceNet');
      return;
    }

    async function ensureYoutube() {
      if (global.SNYoutube && SNYoutube.find) return global.SNYoutube;
      try {
        if (global.SNLoader && SNLoader.ensure) await SNLoader.ensure('youtube');
      } catch (_) {}
      if (global.SNYoutube && SNYoutube.find) return global.SNYoutube;
      await new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = '/js/spacenet/youtube.js?v=' + Date.now();
        s.onload = resolve;
        s.onerror = function () {
          reject(new Error('youtube module missing'));
        };
        document.head.appendChild(s);
      });
      return global.SNYoutube;
    }

    async function runYoutubeSearch(raw) {
      var Yt = await ensureYoutube();
      if (!Yt || !Yt.find) {
        log('YouTube is not loaded. Hard refresh.', 'err');
        return false;
      }
      var q = (Yt.queryFromText && Yt.queryFromText(raw)) || String(raw || '').trim();
      if (!q) q = String(raw || '').trim();
      preview('Searching YouTube…');
      log('YouTube · ' + q, 'ok');
      var r = await Yt.find(q);
      return !!(r && r.ok);
    }

    try {
      if (low === 'help' || low === '?' || low === 'commands') {
        help();
        return;
      }
      if (low === 'omma' || low === 'όμμα' || low === 'the eye' || low === 'new agent') {
        if (global.SNOmma && SNOmma.introduce) {
          await SNOmma.introduce();
        } else {
          log("Ómma is not loaded yet. Hard refresh.", 'dim');
        }
        return;
      }
      if (
        /^play\s+\d+$/.test(low) &&
        global.SNYoutube &&
        SNYoutube.results &&
        SNYoutube.results.length
      ) {
        await SNYoutube.playIndex(low.replace(/^play\s+/, ''));
        return;
      }
      if (/^(yt close|youtube close|close youtube|close video)$/.test(low)) {
        try {
          if (global.SNYoutube && SNYoutube.close) SNYoutube.close();
        } catch (_) {}
        return;
      }
      if (
        /^(youtube|yt|watch|clip)\b/.test(low) ||
        (global.SNYoutube && SNYoutube.wantsYoutube && SNYoutube.wantsYoutube(line))
      ) {
        await runYoutubeSearch(line);
        return;
      }
      if (low === 'live' || low === 'fluid' || low === 'live wire') {
        if (global.SNFluid && SNFluid.speakStatus) SNFluid.speakStatus();
        else log('Live wire is not loaded yet. Hard refresh.', 'dim');
        return;
      }
      if (low === 'live on' || low === 'fluid on') {
        if (global.SNFluid) {
          SNFluid.start();
          SNFluid.pull({ speak: true, force: true });
          log('Live wire listening.', 'ok');
        }
        return;
      }
      if (low === 'live off' || low === 'fluid off') {
        if (global.SNFluid) SNFluid.stop();
        log('Live wire off.', 'dim');
        return;
      }
      if (low === 'live now' || low === 'live apply' || low === 'fluid now') {
        if (global.SNFluid && SNFluid.pull) await SNFluid.pull({ speak: true, force: true });
        return;
      }
      if (global.SNFluid && SNFluid.isWish && SNFluid.isWish(line)) {
        await SNFluid.wish(line);
        return;
      }
      if (low === 'spacexai' || low === 'flight' || low === 'fly mode') {
        if (global.SNSpaceXai && SNSpaceXai.enter) SNSpaceXai.enter();
        else log('Flight computer not loaded. Hard refresh.', 'dim');
        return;
      }
      if (low === 'cancel' || low === 'stop' || low === 'unstick' || low === 'reset ai') {
        try { turnOpen = 0; setLive(false); setActivity('idle'); } catch (_) {}
        try { if (global.SNAi) { /* busy cleared on next ask via watchdog */ } } catch (_) {}
        try { if (global.SNRecover) SNRecover({ closeMap: false }); } catch (_) {}
        log('Cleared · ready', 'ok');
        preview('ready');
        return;
      }

      // Owner test harness — offer tiles / polygons (before dialect/AI freeform)
      if (global.SNOfferStack && typeof SNOfferStack.handleLine === 'function') {
        const offerKeys =
          /^(offers?|tiles?|throw tiles|launch tiles|demo delivery|demo route|demo full|full demo|test tiles|test offers|test delivery|test polygons?|test poly|poly test|polygon|moving driver|driver on route|clear offers|clear tiles|clear routes|clear polygons|clear all|routes|radar|refresh routes|test harness|demo all|test all|offers help|test help|help offers|task complete|complete task|finish task|offers complete|complete offer)\b/i;
        if (offerKeys.test(low) || /^(do|run|launch|start)\s+(tiles|offers|polygon|demo|delivery)/i.test(low)) {
          try {
            const handled = await SNOfferStack.handleLine(line);
            if (handled) return;
          } catch (eOff) {
            log('Offers · ' + (eOff && eOff.message ? eOff.message : eOff), 'err');
            return;
          }
        }
      }
      if (low === 'clear' || low === 'clear feed') {
        const box = feedBox();
        if (box) {
          box.innerHTML = '';
          const hint = document.createElement('div');
          hint.id = 'cli-feed-search-hint';
          box.appendChild(hint);
        }
        applyFeedFilter('');
        stickBottom = true;
        preview('cleared');
        return;
      }
      if (low === 'brain' || low === 'memory') {
        dumpBrain('summary');
        return;
      }
      // Real use: task board · route-compatible jobs
      if (
        low === 'sim task' ||
        /^sim\s+task\b/.test(low) ||
        low === 'sim route' ||
        low === 'drive task' ||
        /^sim\b/.test(low)
      ) {
        log('Sim/training removed · use task list · claim · deliver · task map', 'dim');
        return;
      }
                  if (low === 'task fit' || low === 'tasks fit' || low === 'compatible' || low === 'fit tasks') {
        if (global.SNTaskBoard?.listCompatibleOnCli) SNTaskBoard.listCompatibleOnCli();
        else log('Task board loading · hard refresh', 'err');
        return;
      }
      // Plan queries first (before isCoordIntent — "plan" must not create)
      if (low === 'plan list' || low === 'plans' || low === 'plans list') {
        const plans = Tasks?.listPlans?.({ all: true }) || [];
        if (!plans.length) {
          log('No plans · coord need driver and vendor for pizza for 3', 'dim');
        } else {
          plans.slice(0, 12).forEach((p) => {
            log(
              (p.status || 'open') +
                ' · ' +
                String(p.id).slice(-8) +
                (p.food ? ' · ' + p.food : '') +
                (p.party ? ' · ×' + p.party : '') +
                ' · ' +
                (p.taskIds?.length || 0) +
                ' tasks',
              'ok'
            );
          });
        }
        preview(plans.length + ' plans');
        return;
      }
      if (low === 'plan status' || low === 'plan' || /^plan\s+status\b/.test(low)) {
        const idPart = line.replace(/^plan(\s+status)?\s*/i, '').trim();
        const st = Tasks?.planStatus?.(idPart || undefined);
        if (st?.ok) {
          const body = Tasks.formatPlanCli?.(st) || st.reply;
          String(body)
            .split('\n')
            .forEach((ln) => {
              if (ln.trim()) log(ln.trim(), 'ok');
            });
          preview('Plan status');
        } else log(st?.error || 'no plan', 'dim');
        return;
      }
      // Multi-user coordination plans (P0)
      if (
        /^coord\b|^coordinate\b|^team\b/.test(low) ||
        (Tasks?.isCoordIntent && Tasks.isCoordIntent(line))
      ) {
        const text = line.replace(/^(coord|coordinate|team)\s*/i, '').trim() || line;
        activity('coordinating…', 'work', { label: 'Coord' });
        const r = Tasks?.createPlan?.(text);
        if (r?.ok) {
          const body = Tasks.formatPlanCli?.(r) || r.reply || 'Plan created';
          String(body)
            .split('\n')
            .forEach((ln) => {
              if (ln.trim()) log(ln.trim(), 'ok');
            });
          preview('Plan · ' + (r.tasks?.length || 0) + ' tasks');
          try {
            if (global.SNMap?.active) {
              global.SNMap.showTasks?.();
              global.SNMap.showProfiles?.();
            }
          } catch (_) {}
        } else log(r?.error || 'Could not create plan', 'err');
        return;
      }
      if (/^assign\b/.test(low)) {
        activity('assigning…', 'work', { label: 'Assign' });
        const r = Tasks?.assignPlan?.(line);
        if (r?.ok) {
          const body = Tasks.formatPlanCli?.(r) || r.reply || 'Assigned';
          String(body)
            .split('\n')
            .forEach((ln) => {
              if (ln.trim()) log(ln.trim(), 'ok');
            });
          preview('Assigned');
        } else log(r?.error || 'assign failed', 'err');
        return;
      }
      if (low === 'advise' || low === 'traffic' || low === 'scan advise') {
        if (global.SNTaskBoard?.adviseScan) SNTaskBoard.adviseScan();
        else log('Advise offline', 'dim');
        return;
      }
      if (/^task\s+open\b|^open\s+task\b/.test(low)) {
        const id = line.replace(/^(task\s+open|open\s+task)\s*/i, '').trim();
        const open = Tasks?.list?.({ all: true }) || [];
        const t =
          (id && open.find((x) => x.id === id || String(x.title || '').toLowerCase().includes(id.toLowerCase()))) ||
          open[0];
        if (t && global.SNTaskBoard?.openTaskTile) SNTaskBoard.openTaskTile(t);
        else log('No task · task list', 'dim');
        return;
      }
      if (low === 'task map' || low === 'tasks map' || low === 'preview tasks') {
        const open = Tasks?.list?.({ all: true }) || [];
        const t =
          open.find((x) => x.status === 'claimed' || x.status === 'in_progress') || open[0];
        if (t && global.SNTaskBoard?.previewTaskOnMap)
          await SNTaskBoard.previewTaskOnMap(t, { fit: true, force: true });
        else log('No tasks to preview', 'dim');
        return;
      }
      if (low === 'super' || low === 'fleet' || low === 'super deck') {
        if (global.SNSuper && SNSuper.show) SNSuper.show();
        else log('Super deck loading · hard refresh', 'err');
        return;
      }
      // early bridge handler removed — full bridge block later

      // ── Coding bridge (early — before AI fallthrough) ──
      if (
        /^(bridge|live bridge|rockbridge|rock bridge|grok bridge|coding bridge)(\s|$)/i.test(low) ||
        /^(is the )?(grok |coding |live )?bridge\b/.test(low) ||
        /\bbridge\b.*\b(work|working|status|ok|test|poll)\b/.test(low) ||
        /\b(work|working|status|ok|test)\b.*\bbridge\b/.test(low) ||
        low === 'bridge test' ||
        low === 'test bridge' ||
        /^(agent|fix|note|for agent|tell agent|ask agent)\b/i.test(low)
      ) {
        // handled in dedicated block below — jump by re-checking after mind block is slow;
        // call bridge ops inline for reliability
        try {
          const B = global.SNLiveBridge;
          if (!B) {
            log('Bridge loading · try again in a second', 'dim');
            return;
          }
          B.start && B.start();
          if (/^(agent|fix|note|for agent|tell agent|ask agent)\b/i.test(low)) {
            const text = line
              .replace(/^(agent|fix|note|for agent|tell agent|ask agent)\s*/i, '')
              .trim();
            if (!text) {
              log('Usage · agent <what to fix>', 'dim');
              return;
            }
            log('Sending note to coding agent · ' + text.slice(0, 80), 'ok');
            const r = await SNLiveBridge.ownerNote(text, { from: 'cli' });
            log(
              r && r.remote
                ? 'Note on live bridge · Grok Build can pick it up'
                : 'Note saved · try bridge test',
              'ok'
            );
            preview('Agent note saved');
            return;
          }
          const wantTest = /\btest\b/.test(low) || low === 'bridge test' || low === 'test bridge';
          if (wantTest && B.selfTest) {
            const r = await B.selfTest();
            preview(r && r.ok ? 'Bridge OK' : 'Bridge weak');
            return;
          }
          if (/\bpoll\b/.test(low) && B.poll) await B.poll();
          const st = B.status ? await B.status() : null;
          if (st && st.ok) {
            log(
              'Bridge LIVE · seq ' +
                (st.lastSeq || st.remote?.seq || 0) +
                ' · notes ' +
                (st.remote?.notes || st.localNotes || 0),
              'ok'
            );
            if (st.remote?.lastNote)
              log('Last · ' + String(st.remote.lastNote).slice(0, 100), 'dim');
            log('agent <text> · bridge test', 'dim');
          } else {
            log('Bridge warming · ' + (st && st.error ? st.error : '…'), 'dim');
          }
          preview(st && st.ok ? 'Bridge live' : 'Bridge warming');
        } catch (e) {
          log(String(e.message || e), 'err');
        }
        return;
      }
      // Astranov Mind — permanent owner memory
      if (
        low === 'free mind' ||
        low === 'free ai' ||
        low === 'astranov mind' ||
        low === 'mind status' ||
        low === 'mind' ||
        low === 'my mind'
      ) {
        const st = (global.SNAstranovMind || global.SNFreeMind)?.status?.() || {};
        log('── Astranov Mind ──', 'ok');
        log(
          'Owner memory · ' +
            (st.learned || 0) +
            ' lived notes · ' +
            (st.seeds || 0) +
            ' seed memories · train ' +
            (st.train || 'v6') +
            ' · evolves forever',
          'ok'
        );
        log('English · Greek · Greeklish · ancient · Telemachos · tray pitogyra mpyronia', 'dim');
        log('If broken speech: mind wipe · then hard refresh', 'dim');

        preview('Astranov Mind');
        global.SNGlobe?.setHud?.('ASTRANOV MIND');
        return;
      }
      if (
        low === 'telemachos' ||
        low === 'tilemaxos' ||
        low === 'pilot' ||
        low === 'drone' ||
        /^pilot\b|^telemach|^tilemax|^deliver\b/i.test(low)
      ) {
        if (global.SNTelemachos?.cli) {
          const r = await SNTelemachos.cli(line);
          log(
            r?.tray
              ? 'Telemachos · ' + r.tray
              : 'Telemachos (Τηλέμαχος) · drone pilot ready',
            'ok'
          );
          preview('Telemachos');
        } else log('Telemachos loading · hard refresh', 'err');
        return;
      }
      if (low === 'archangelos' || low === 'arcangelo' || /^fly\s+archangel/i.test(low)) {
        if (global.SNTelemachos?.flyHome) await SNTelemachos.flyHome();
        else log('Archangelos · 36.215, 28.125 Rhodes', 'ok');
        preview('Archangelos');
        return;
      }
      if (
        low === 'mind wipe' ||
        low === 'wipe mind' ||
        low === 'forget all' ||
        low === 'clear mind' ||
        low === 'mind reset'
      ) {
        try {
          const w = global.SNFreeMind?.wipe?.('cli');
          log('Memory cleared. Fresh start — talk normally.', 'ok');
          log('Notes kept: ' + (w && w.learned != null ? w.learned : '?'), 'dim');
          preview('Fresh');
        } catch (eW) {
          log('Could not clear memory — hard refresh the page.', 'err');
        }
        return;
      }
      if (low === 'free export' || low === 'mind export' || low === 'export mind') {
        try {
          const pack = global.SNFreeMind?.exportTrainset?.();
          if (!pack) {
            log('Free mind loading · hard refresh', 'err');
            return;
          }
          const json = JSON.stringify(pack, null, 2);
          if (navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(json).then(
              () => log('Trainset copied · ' + pack.count + ' rows', 'ok'),
              () => log('Copy failed · see console', 'err')
            );
          } else {
            log('Trainset ' + pack.count + ' rows · clipboard unavailable', 'dim');
          }
          console.log('[SNFreeMind trainset]', pack);
          preview(pack.count + ' train rows');
        } catch (e) {
          log('Export fail · ' + (e.message || e), 'err');
        }
        return;
      }
      if (/^teach\b/i.test(low)) {
        if (global.SNAi?.ask) {
          const reply = await SNAi.ask(line);
          if (reply) {
            log(reply, 'ok');
            preview(String(reply).slice(0, 80));
          }
        } else if (global.SNFreeMind?.answer) {
          const r = SNFreeMind.answer(line);
          log(r.text || 'noted', 'ok');
        }
        return;
      }
      if (low === 'law' || low === 'rules' || low === 'invariants') {
        dumpBrain('law');
        return;
      }
      if (low === 'verify' || low === 'check' || low === 'brain verify' || low === 'verify brain') {
        dumpBrain('verify');
        return;
      }
      // next / show all / prev → AI vendor carousel (globe + tile)
      if (
        /^(next|επόμεν|επομεν|άλλο|αλλο|another|next\s*one|n|prev|previous|back|show\s*all|all|όλα|ολα|όλοι|ολοι)$/i.test(
          low
        ) ||
        low === '>>' ||
        low === '<<'
      ) {
        if (global.SNAi?.ask) {
          const reply = await SNAi.ask(line);
          if (reply) {
            log(reply, 'ok');
            preview(String(reply).slice(0, 80));
          }
        } else log('AI loading · hard refresh', 'err');
        return;
      }
      // Escape pizza / order pause
      if (
        /\b(cancel|stop order|clear order|never mind|forget (it|the order)|abort|unstick)\b/i.test(
          low
        )
      ) {
        try {
          global.SNMarket?.clearPending?.('Order pause cleared');
        } catch (_) {}
        log("Cleared. Not stuck on pizza — say what you need.", 'ok');
        preview('ready');
        return;
      }
      if (isVodiResearch(low) || isVodiResearch(line)) {
        await runVodiResearch(line);
        return;
      }
      // Pending lazy-order location confirm — exact yes/no only
      if (
        global.SNMarket?.loadPending?.() &&
        (global.SNMarket.isLocConfirmLine?.(line) ||
          /^(yes|y|ok|okay|no|nope|wrong|ν|ναι|όχι)$/i.test(low))
      ) {
        activity('location check…', 'work', { label: 'Confirm' });
        const cr = await global.SNMarket.confirmLocationAndOrder(line);
        if (cr?.summary) {
          String(cr.summary)
            .split('\n')
            .forEach((ln) => {
              if (ln.trim()) log(ln.trim(), /failed|reject|error/i.test(ln) ? 'err' : 'ok');
            });
        } else if (cr?.reply) log(cr.reply, cr.ok ? 'ok' : 'err');
        if (cr?.best) {
          depict(cr.ok ? 'order' : 'locate', {
            lat: cr.best?.lat || cr.pos?.lat,
            lng: cr.best?.lng || cr.pos?.lng,
            label: cr.best?.shopName || cr.best?.name || 'You',
          });
        }
        preview(cr?.eatLine || cr?.reply || 'done');
        if (cr?.eatLine) replyOut(cr.eatLine);
        return;
      }
      // Food — strict parser only. Full pay loop only when user orders.
      {
        const fi = global.SNMarket?.parseFoodIntent?.(line);
        if (
          fi &&
          !/^(list\s+shop|menu\s+add|order\s+me\s*$|drive\s+on|first\s+delivery)/i.test(low)
        ) {
          const wantOrder =
            fi.autoOrder === true ||
            fi.lazyJudge === true ||
            fi.oneWord === true ||
            (/\border\b/i.test(low) &&
              /\b(pizza|sushi|burger|coffee|food|souvlaki|kebab)\b/i.test(low)) ||
            /^(pizza|πιτσα|πίτσα|sushi|burger|thelo pizza)$/i.test(low);
          fi.autoOrder = wantOrder;
          fi.lazyJudge = wantOrder;
          fi.browseOnly = !wantOrder;
          fi.raw = line;
          const here =
            global._snPhysPos ||
            (global._snLastPos &&
            !isFakeDemoPin(global._snLastPos.lat, global._snLastPos.lng, global._snLastPos)
              ? global._snLastPos
              : null);
          if (wantOrder && (!here || here.lat == null)) {
            try {
              const pin = await gpsLocate({ allowIp: true, allowSoft: true });
              if (pin && pin.lat != null && !isFakeDemoPin(pin.lat, pin.lng, pin)) {
                commitRealGps(pin);
              }
            } catch (_) {}
          }
          const here2 =
            global._snPhysPos ||
            (global._snLastPos &&
            !isFakeDemoPin(global._snLastPos.lat, global._snLastPos.lng, global._snLastPos)
              ? global._snLastPos
              : here);
          if (wantOrder && (!here2 || here2.lat == null)) {
            log('I need your real place first. Tap locate, then say pizza again.', 'ok');
            return;
          }
          if (wantOrder && !(global.SNAuth && SNAuth.user)) {
            log('Sign in with Google to pay. I still hunt the pizza now.', 'ok');
            try {
              if (global.SNAuth && SNAuth.signInGoogleGis) void SNAuth.signInGoogleGis();
              else if (global.SNAuth && SNAuth.openModal) SNAuth.openModal();
            } catch (_) {}
          }
          activity(
            (wantOrder ? 'ordering ' : 'finding ') + (fi.food || 'food') + '…',
            'food',
            { label: fi.food || 'food' }
          );
          const r = await global.SNMarket.fulfillFoodIntent(fi, {
            autoOrder: wantOrder,
            quiet: false,
            judgeAll: wantOrder,
            softHome: false,
            skipLocConfirm: wantOrder,
            allowSelfCourier: wantOrder,
            testMode: false,
          });
          if (r?.best) {
            depict(wantOrder ? 'order' : 'food', {
              lat: r.best.lat,
              lng: r.best.lng,
              label: r.best.shopName || r.best.name || fi.food,
            });
          }
          if (r?.needsConfirm) {
            log(r.reply || 'Is this your location? Yes or no.', 'ok');
            preview('waiting · yes / no');
            replyOut(r.reply || 'Is this your location?');
            return;
          }
          if (r?.reply) log(r.reply, r.ok ? 'ok' : 'err');
          else if (r?.error) log(r.error, 'err');
          else if (!wantOrder && r?.best)
            log('Found ' + (r.best.shopName || r.best.name) + ' — say order to buy.', 'ok');
          preview(r?.eatLine || r?.reply || (r?.ok ? 'done' : 'ok'));
          if (r?.eatLine) replyOut(r.eatLine);
          else if (r?.reply) replyOut(r.reply);
          return;
        }
      }
      // First marketplace loop + usage (SpaceNet coaches the same path)
      if (
        low === 'first delivery' ||
        low === 'first loop' ||
        low === 'first order' ||
        low === 'πρώτη παράδοση'
      ) {
        activity('Need your place first', 'work', { label: 'First order' });
        const here =
          global._snPhysPos ||
          (global._snLastPos &&
          !isFakeDemoPin(global._snLastPos.lat, global._snLastPos.lng, global._snLastPos) &&
          (global._snLastPos.real || global._snLastPos.source === 'gps')
            ? global._snLastPos
            : null);
        if (!here || here.lat == null) {
          log('I need your real place first. Tap locate, then say first delivery again.', 'ok');
          return;
        }
        depict('shops', { label: 'First order' });
        log('first order · from your place · shop → menu → pay → you', 'ok');
        if (global.SNMarket?.runFirstLoop) {
          const r = await global.SNMarket.runFirstLoop({ skipLocate: true });
          if (r?.ok) {
            const p = global._snLastPos || global.SNTasks?.pos;
            if (p) depict('delivery', { lat: p.lat, lng: p.lng, label: 'Delivered' });
            log('shop live · ' + (r.listed?.shop || 'ok'), 'ok');
            log(
              'menu · ' +
                (r.menu?.item?.name || 'item') +
                ' · ' +
                (global.SNCurrency?.format?.(r.menu?.item?.price ?? r.total) ||
                  (r.total != null ? r.total + ' S' : '')),
              'ok'
            );
            log(
              'paid · ' +
                (global.SNCurrency?.format?.(r.total ?? r.order?.total) ||
                  (r.order?.total != null ? r.order.total + ' S' : 'S')),
              'ok'
            );
            log('driver claimed · delivered to you', 'ok');
            log('FIRST ORDER COMPLETE', 'ok');
            preview('FIRST ORDER DONE · on map');
          } else {
            log(
              'first order failed · ' +
                (r?.error ||
                  r?.order?.error ||
                  r?.delivery?.error ||
                  r?.listed?.error ||
                  r?.menu?.error ||
                  'unknown'),
              'err'
            );
          }
        } else {
          log('Market not loaded · hard refresh', 'err');
        }
        return;
      }
      if (/^list\s+shop\b/.test(low) || /^shop\s+name\b/.test(low)) {
        const name = line.replace(/^(list\s+shop|shop\s+name)\s+/i, '').trim() || 'My shop';
        const r = global.SNMarket?.listShop?.(name);
        log(r?.ok ? 'Shop listed · ' + r.shop + ' · next: menu add Name 5' : r?.error || 'fail', r?.ok ? 'ok' : 'err');
        return;
      }
      if (/^menu\s+add\b/.test(low) || /^add\s+item\b/.test(low)) {
        const m = line.match(/^(?:menu\s+add|add\s+item)\s+(.+?)\s+(\d+(?:[.,]\d+)?)/i);
        if (!m) {
          log('Usage: menu add Espresso 3.5', 'dim');
          return;
        }
        const r = global.SNMarket?.addMenuItem?.(m[1].trim(), parseFloat(m[2].replace(',', '.')));
        log(r?.ok ? 'Menu item added · next: order me' : r?.error || 'fail', r?.ok ? 'ok' : 'err');
        return;
      }
      if (low === 'order me' || low === 'order self' || low === 'buy from me') {
        const r = global.SNMarket?.orderFromMyShop?.(1);
        log(
          r?.ok
            ? 'Order ' + (global.SNCurrency?.format?.(r.total) || r.total + ' S') + ' · next: drive on'
            : r?.error || 'order fail',
          r?.ok ? 'ok' : 'err'
        );
        return;
      }
      if (low === 'first order' || low === 'real order' || low === 'first live order') {
        log('FIRST LIVE ORDER · shop × driver × you', 'ok');
        const pin = global._snPhysPos || global._snLastPos;
        if (!pin || pin.lat == null) {
          try {
            const g = await gpsLocate({ allowIp: true, allowSoft: true });
            if (g && g.lat != null) commitRealGps(g);
          } catch (_) {}
        }
        const here =
          global._snPhysPos ||
          (global._snLastPos && global._snLastPos.lat != null ? global._snLastPos : null);
        if (!here || here.lat == null) {
          log('Tap locate, then say first order again.', 'ok');
          return;
        }
        activity('first live order…', 'food', { label: 'PIZZA' });
        const r = await global.SNMarket.fulfillFoodIntent('pizza', {
          autoOrder: true,
          quiet: false,
          judgeAll: true,
          skipLocConfirm: true,
          allowSelfCourier: true,
          softHome: true,
        });
        if (r?.reply) log(r.reply, r.ok ? 'ok' : 'err');
        if (r?.ok) {
          try {
            global.SNMarket.goDriverOnline && SNMarket.goDriverOnline();
          } catch (_) {}
          log('Shop accepted · you are also the courier for this first live proof.', 'ok');
          log('Type deliver me when the pizza lands — ⭐ shop + driver get paid then.', 'ok');
        }
        preview(r?.ok ? 'LIVE ORDER' : 'order failed');
        return;
      }
      if (low === 'drive on' || low === 'driver on' || low === 'go online' || low === 'driver online') {
        const r = global.SNMarket?.goDriverOnline?.();
        log(r?.ok ? 'Driver ONLINE · next: claim / deliver me' : r?.error || 'fail', r?.ok ? 'ok' : 'err');
        return;
      }
      if (low === 'deliver me' || low === 'claim and deliver' || low === 'finish delivery') {
        const r = global.SNMarket?.claimAndComplete?.();
        if (r?.ok) {
          const s = r.settled || {};
          log(
            'Delivered · settled' +
              (s.driverPaid != null ? ' · driver ' + s.driverPaid + ' S' : '') +
              (s.vendorPaid != null ? ' · vendor ' + s.vendorPaid + ' S' : ''),
            'ok'
          );
          preview('DELIVERED · settled');
        } else {
          log(r?.error || 'fail', 'err');
        }
        return;
      }
      if (low === 'market status' || low === 'marketplace' || low === 'orders status') {
        const open = (global.SNTasks?.list?.({ kind: 'delivery' }) || []).filter(
          (t) => t.status !== 'done'
        );
        const done = (global.SNTasks?.list?.({ all: true, kind: 'delivery' }) || []).filter(
          (t) => t.status === 'done'
        );
        const w = global.SNCurrency?.snapshot?.() || {};
        log(
          'Market · open deliveries ' +
            open.length +
            ' · done ' +
            done.length +
            ' · wallet ' +
            (w.line || '?') +
            ' · vault ' +
            (global.SNCurrency?.format?.(w.platformFees) || (w.platformFees || 0) + ' S'),
          'ok'
        );
        open.slice(0, 6).forEach((t) => {
          log(
            '  ' +
              (t.status || '?') +
              ' · ' +
              String(t.title || '').slice(0, 42) +
              (t.total_s != null ? ' · ' + t.total_s + ' S' : ''),
            'dim'
          );
        });
        preview(open.length + ' open · market');
        return;
      }
      if (
        low === 'mesh' ||
        low === 'network' ||
        low === 'network orders' ||
        low === 'open deliveries' ||
        low === 'mesh pull'
      ) {
        try {
          if (!global.SNMeshOrders) {
            log('Mesh loading · try again in a second', 'dim');
            return;
          }
          activity('mesh · network deliveries…', 'delivery', { label: 'Mesh' });
          const r = await global.SNMeshOrders.pullOpenOrders({ quiet: false });
          const st = global.SNMeshOrders.status?.() || {};
          log(
            'Mesh · network open ' +
              (st.openNetwork || 0) +
              ' · pulled ' +
              (r?.imported || 0) +
              ' · total near ' +
              (r?.count || 0),
            r?.ok ? 'ok' : 'dim'
          );
          preview('mesh · ' + (st.openNetwork || 0));
        } catch (e) {
          log('Mesh · ' + (e.message || e), 'err');
        }
        return;
      }
      if (low === 'usage' || low === 'usage summary' || low === 'stats') {
        const s = global.SNUsage?.summary?.(14);
        if (!s) {
          log('Usage offline', 'err');
          return;
        }
        log('Usage · Athens ' + s.athensToday + ' · ' + s.events + ' events · handoffs ' + s.openHandoffs, 'ok');
        (s.top || []).forEach((t) => log('· ' + t.name + ' ×' + t.n, 'dim'));
        const f = s.flags || {};
        log(
          'Flags · vendor=' +
            !!f.firstVendorListed +
            ' delivery=' +
            !!f.firstDeliveryDone,
          'dim'
        );
        return;
      }
      if (low === 'usage export' || low === 'ship packet' || low === 'export usage') {
        const pkt = global.SNUsage?.shipPacket?.() || '';
        log('── ship packet (copy for coding agent / midnight) ──', 'ok');
        pkt.split('\n').forEach((ln) => log(ln, 'dim'));
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            void navigator.clipboard.writeText(pkt);
            log('Copied ship packet to clipboard', 'ok');
          }
        } catch (_) {}
        return;
      }
      if (low === 'close tile' || low === 'closetile' || low === 'tile close' || low === 'close panel') {
        global.SNTile?.close?.();
        global.SNCli?.stopHandsfree?.('stopped');
        try {
          global.speechSynthesis?.cancel?.();
        } catch (_) {}
        global.SNUi?.resetChrome?.();
        log('Tile closed · chrome reset · voice stopped', 'ok');
        return;
      }
      if (low === 'reset ui' || low === 'reset chrome' || low === 'unscatter') {
        global.SNTile?.close?.();
        global.SNCli?.stopHandsfree?.('stopped');
        try {
          global.speechSynthesis?.cancel?.();
        } catch (_) {}
        global.SNUi?.resetChrome?.();
        log('UI reset · CLI bottom · controls in corners', 'ok');
        return;
      }
      if (low === 'stop talking' || low === 'shut up' || low === 'silence' || low === 'stop voice') {
        try {
          global.speechSynthesis?.cancel?.();
        } catch (_) {}
        global.SNCli?.stopHandsfree?.('stopped');
        log('Voice stopped', 'ok');
        return;
      }
      if (low === 'lang en' || low === 'language en' || low === 'english mode') {
        try {
          localStorage.setItem(VOICE_LANG_KEY, 'en');
        } catch (_) {}
        global._snLastUserLang = 'en';
        log('Language core · English (default perfect base)', 'ok');
        return;
      }
      if (low === 'lang el' || low === 'language el' || low === 'greek mode' || low === 'ελληνικά') {
        try {
          localStorage.setItem(VOICE_LANG_KEY, 'el');
        } catch (_) {}
        global._snLastUserLang = 'el';
        log('Language · Greek STT/TTS · still understand all languages', 'ok');
        return;
      }
      if (low === 'lang auto' || low === 'language auto') {
        try {
          localStorage.setItem(VOICE_LANG_KEY, 'auto');
        } catch (_) {}
        log('Language · auto · English base, Greek when you speak Greek', 'ok');
        return;
      }
      if (low === 'voice on' || low === 'speak on' || low === 'tts on') {
        hfSpeakOut = true;
        try {
          localStorage.setItem(VOICE_KEY, '1');
        } catch (_) {}
        warmVoices();
        speakAi('Voice on.', 'test');
        log('Voice ON · replies may be spoken · type voice off to silence', 'ok');
        return;
      }
      if (low === 'voice off' || low === 'speak off' || low === 'tts off') {
        hfSpeakOut = false;
        try {
          localStorage.setItem(VOICE_KEY, '0');
        } catch (_) {}
        killSpeech();
        log('Voice OFF · AI stays silent', 'ok');
        return;
      }
      if (low === 'voice test' || low === 'test voice' || low === 'say test') {
        warmVoices();
        speakAi('Astranov voice test.', 'test');
        log('Voice test · one short line only', 'ok');
        return;
      }
      if (low === 'handoff' || low === 'handoffs') {
        const list = global.SNUsage?.openHandoffs?.() || [];
        if (!list.length) log('No open handoffs · report a pain in chat to queue one', 'dim');
        else list.slice(0, 12).forEach((h, i) => log(i + 1 + '. ' + h.note.slice(0, 100), 'ok'));
        return;
      }
      if (/^handoff\s+/.test(low)) {
        const note = line.replace(/^handoff\s+/i, '').trim();
        global.SNUsage?.handoff?.(note, { source: 'cli' });
        log('Handoff queued · Athens midnight ship picks one fix', 'ok');
        return;
      }

      // Unified multi-role tile juice
      if (low === 'menu home' || low === 'home menu' || low === 'account' || low === 'settings') {
        if (global.SNHome?.toggle) global.SNHome.toggle();
        else log('Home menu loading…', 'dim');
        return;
      }
      if (low === 'routes' || low === 'radar routes' || low === 'show routes') {
        log('Rhodes · delivery polygons on radar (vendor→client · ETA · km/h)…', 'dim');
        const list = (await global.SNField?.refreshRoutes?.(true)) || global.SNField?.routes || [];
        if (!list.length) log('No open delivery routes · order from a vendor first', 'dim');
        else {
          list.forEach((r) =>
            log(
              '━ ' +
                (r.label || r.id) +
                (r.km != null ? ' · ' + Number(r.km).toFixed(2) + ' km' : '') +
                (r.eta ? ' · ETA ' + r.eta : '') +
                (r.speedKmh != null ? ' · ' + Math.round(r.speedKmh) + ' km/h' : '') +
                ' · ' +
                (r.points?.length || 0) +
                ' pts',
              'ok'
            )
          );
          // Do not auto-expand radar — user taps radar for big view
          preview((list[0] && list[0].label) || 'routes');
        }
        return;
      }
      if (low === 'support list' || low === 'support') {
        const list = global.SNHome?.supportList?.() || [];
        if (!list.length) log('No support requests · type: support help <your question>', 'dim');
        else
          list.slice(0, 12).forEach((r) =>
            log(
              (r.status === 'open' ? '○ ' : '● ') +
                r.id +
                ' · ' +
                String(r.text).slice(0, 60) +
                (r.helper ? ' · helped by ' + r.helper : ''),
              r.status === 'open' ? 'ok' : 'dim'
            )
          );
        log('Ambassadors: support claim [id] · earn S', 'dim');
        return;
      }
      if (/^support\s+help\b|^support\s+ask\b/.test(low)) {
        const text = line.replace(/^support\s+(help|ask)\s+/i, '').trim() || 'Need help on SpaceNet';
        const r = global.SNHome?.supportRequest?.(text);
        log(r ? 'Support request open · ' + r.id : 'Support offline', r ? 'ok' : 'err');
        return;
      }
      if (/^support\s+claim\b|^help\s+claim\b/.test(low)) {
        const id = line.replace(/^(support\s+claim|help\s+claim)\s*/i, '').trim() || null;
        const r = global.SNHome?.supportClaim?.(id || undefined);
        if (r?.ok)
          log(
            'Helped · +' +
              (global.SNCurrency?.format?.(r.reward) || r.reward + ' S') +
              ' ambassador mine',
            'ok'
          );
        else log(r?.error || 'claim failed', 'err');
        return;
      }
      if (low === 'me' || low === 'profile' || low === 'tile' || low === 'plus' || low === 'my tile' || low === 'user') {
        if (global.SNField && SNField.openLoggedInUser) {
          const r = SNField.openLoggedInUser();
          if (r && r.signed) log('Logged in · ' + (r.name || 'you') + ' · tile + map', 'ok');
          else log('Opening sign-in…', 'dim');
        } else {
          global.SNTile?.openMe?.();
          log('Your tile', 'ok');
        }
        return;
      }
      if (low === 'roles' || low === 'role') {
        const me = global.SNProfiles?.me?.();
        if (!me) {
          log('Profiles loading…', 'dim');
          return;
        }
        Object.keys(global.SNProfiles.ROLES).forEach((k) => {
          log((me.roles[k] ? '● ' : '○ ') + k + ' · ' + global.SNProfiles.ROLES[k].label, me.roles[k] ? 'ok' : 'dim');
        });
        log('Toggle: role vendor worker · role dating · role driver', 'dim');
        global.SNTile?.openMe?.('about');
        return;
      }
      if (/^role\s+/.test(low)) {
        const role = low.replace(/^role\s+/, '').trim().split(/\s+/)[0];
        const me = global.SNProfiles?.me?.();
        if (!me || !global.SNProfiles.ROLES[role]) {
          log('Roles: social dating vendor driver client worker', 'dim');
          return;
        }
        const p = global.SNProfiles.toggleRole(me.id, role);
        log('Role ' + role + ' · ' + (p.roles[role] ? 'ON' : 'off'), 'ok');
        global.SNTile?.open?.(p);
        global.SNMap?.showProfiles?.();
        return;
      }
      if (low === 'menu') {
        // Menu lives on vendor tile only — strip chips + expand Menu tab
        const vendors = global.SNProfiles?.list?.({ role: 'vendor' }) || [];
        if (!vendors.length) {
          const p = Tasks?.pos || global._snLastPos || { lat: 36.43, lng: 28.22 };
          await global.SNCommerce?.ensureSector?.(p.lat, p.lng, { openMap: false });
        }
        const list = global.SNProfiles?.list?.({ role: 'vendor' }) || [];
        list.slice(0, 12).forEach((v) => {
          log('🏪 ' + (v.shopName || v.name) + ' · ' + (v.menu?.length || 0) + ' items', 'ok');
        });
        const first = list[0];
        if (first) {
          global.SNMap?.showProfiles?.();
          global.SNTile?.open?.(first, { tab: 'menu' });
        } else {
          log('No vendors · shops or long-press map · multi-tile on map', 'dim');
        }
        preview((list.length || 0) + ' vendors · multi-tile on map');
        return;
      }
      if (low === 'drivers' || low === 'driver') {
        const list = global.SNProfiles?.list?.({ role: 'driver' }) || [];
        if (!list.length) {
          log('No drivers yet · open ME tile · enable Driver · Go online to claim deliveries', 'dim');
          global.SNTile?.openMe?.('drive');
        } else {
          list.forEach((d) => {
            log(
              '🛵 ' + d.name + ' · ' + (d.driverOnline ? 'ONLINE' : 'off') + ' · ' + (d.vehicle || ''),
              d.driverOnline ? 'ok' : 'dim'
            );
          });
          const d0 = list[0];
          if (d0?.lat != null) {
            await global.SNMap?.open?.(d0.lat, d0.lng);
            global.SNMap?.showProfiles?.();
            global.SNTile?.open?.(d0, { tab: 'drive' });
          }
        }
        return;
      }
      if (low === 'dates' || low === 'dating people' || low === 'people') {
        const list = global.SNProfiles?.list?.({ role: 'dating' }) || [];
        if (!list.length) {
          log('No dating profiles yet · open ME · enable Dating role (real users only)', 'dim');
          global.SNTile?.openMe?.('dating');
        } else {
          list.forEach((d) => {
            log('💕 ' + d.name + ' · ' + (d.lookingFor || 'open'), 'ok');
          });
          const d0 = list[0];
          if (d0) {
            if (d0.lat != null) await global.SNMap?.open?.(d0.lat, d0.lng);
            global.SNMap?.showProfiles?.();
            global.SNTile?.open?.(d0, { tab: 'dating' });
          }
        }
        return;
      }
      if (low === 'cart' || low === 'basket') {
        const items = global.SNProfiles?.cart?.() || [];
        if (!items.length) log('Cart empty · vendors · tap + on menu items', 'dim');
        else {
          items.forEach((i) =>
            log(
              '· ' +
                i.name +
                ' ' +
                (global.SNCurrency?.format?.(i.price) || i.price + ' S') +
                ' · ' +
                i.vendorName,
              'ok'
            )
          );
          log(
            'Total ' +
              (global.SNCurrency?.format?.(global.SNProfiles.cartTotal() || 0) ||
                (global.SNProfiles.cartTotal() || 0).toFixed(2) + ' S'),
            'ok'
          );
        }
        global.SNTile?.openMe?.('cart');
        return;
      }
      if (low === 'order' || low === 'checkout' || low === 'pay') {
        const r = global.SNProfiles?.placeOrder?.();
        if (!r?.ok) {
          log(r?.error || 'cart empty · open vendors first', 'err');
          return;
        }
        log(
          'Order ' +
            (global.SNCurrency?.format?.(r.total) || r.total.toFixed(2) + ' S') +
            ' · delivery opened for drivers',
          'ok'
        );
        await global.SNMap?.open?.();
        global.SNMap?.showTasks?.();
        global.SNMap?.showProfiles?.();
        return;
      }
      if (
        low === 'seed' ||
        low === 'seed city' ||
        low === 'tiles' ||
        low === 'scan city' ||
        low === 'scan' ||
        low === 'fill sector'
      ) {
        const pos = Tasks?.pos || global._snLastPos || { lat: 36.43, lng: 28.22 };
        log('Live sector scan · DB + crawlers (no dummy seeds)…', 'dim');
        const r = await global.SNCommerce?.ensureSector?.(pos.lat, pos.lng, { openMap: true });
        log(
          r?.count
            ? 'Sector · ' + r.count + ' live tiles · ' + (r.source || 'live')
            : 'No POIs here · try fly athens · or long-press to create',
          r?.count ? 'ok' : 'dim'
        );
        return;
      }
      if (
        low === 's' ||
        low === 'money' ||
        low === 'currency' ||
        low === 'rate' ||
        low === 'spacenets' ||
        low === 'space nets'
      ) {
        moneyStatus();
        // No ribbon money/finance buttons — finance UI = top-right Astranov coins HUD only
        return;
      }


      if (/^imagine\s+\S/.test(low) && !/^imagine\s+on\b/.test(low)) {
        const pic = line.replace(/^imagine\s+/i, '').trim();
        if (global.SNAi && SNAi.imagine) await SNAi.imagine(pic);
        else log('Imagine is not loaded.', 'err');
        return;
      }
      if (low === 'net close' || low === 'research close' || low === 'close net') {
        if (global.SNSearch && SNSearch.closeResults) SNSearch.closeResults();
        log('SpaceNet deck closed', 'dim');
        return;
      }
      if (/^open\s+\d+$/.test(low) || /^watch\s+\d+$/.test(low)) {
        const n = parseInt(low.split(/\s+/)[1], 10);
        if (global.SNSearch && SNSearch.openResult) await SNSearch.openResult(n);
        return;
      }
      if (/^fly\s+\d+$/.test(low)) {
        const n = parseInt(low.split(/\s+/)[1], 10);
        if (global.SNSearch && SNSearch.flyResult) await SNSearch.flyResult(n);
        return;
      }
      if (low === 'mind' || low === 'who are you' || low === 'full mind') {
        let sub = null;
        try {
          sub = global.SNSubscription && SNSubscription.status && SNSubscription.status();
        } catch (_) {}
        const paid = !!(sub && (sub.owner || sub.active || (sub.giftLeft && sub.giftLeft > 0)));
        log(
          paid
            ? 'Full paid mind · flagship · hands: YouTube, fly, search, imagine. This is not the short free organ.'
            : 'Guest mind · three tastes then a plan. Type plans. The flagship mind is on the paid key.',
          'ok'
        );
        preview(paid ? 'full paid mind' : 'guest mind');
        return;
      }

      // Product skin: SpaceXAI default · Astranov electric kept in memory only
      if (low === 'imagine' || low === 'ai graphics' || low === 'imagine on' || low === 'gfx imagine') {
        try {
          if (global.SNAIGraphics && SNAIGraphics.setMode) {
            SNAIGraphics.setMode('imagine');
            try { localStorage.setItem('sn:ai-gfx-mode-v1', 'imagine'); } catch (_) {}
          }
          if (global.SNHelper && SNHelper.wake) {
            SNHelper.wake({ label: 'UNIT · SILVER WINGS' });
            if (SNHelper.patrol) SNHelper.patrol();
          }
          log('IMAGINE · AI graphics online · SpaceX Bot frames', 'ok');
          preview('imagine · on');
        } catch (e) {
          log('imagine fail · ' + (e.message || e), 'err');
        }
        return;
      }
      if (
        low === 'skin' ||
        low === 'skin spacex' ||
        low === 'skin spacexai' ||
        low === 'skin sx' ||
        low === 'skin astranov' ||
        low === 'skin classic' ||
        low === 'skin electric' ||
        low === 'mode spacex' ||
        low === 'mode spacexai' ||
        low === 'mode astranov' ||
        low === 'spacexai' ||
        low === 'astranov mode'
      ) {
        let id = 'spacex';
        if (/astranov|classic|electric/.test(low) && !/spacex/.test(low)) id = 'astranov';
        if (low === 'skin' || low === 'spacexai') {
          const cur =
            (global.SNSkin && SNSkin.read && SNSkin.read()) ||
            localStorage.getItem('sn:skin-v1') ||
            'spacex';
          if (low === 'skin') {
            log(
              'Skin · ' +
                cur +
                ' · SpaceXAI default · Astranov palette in memory · skin spacex | skin astranov',
              'ok'
            );
            return;
          }
        }
        try {
          if (global.SNSkin && SNSkin.apply) SNSkin.apply(id);
          else {
            localStorage.setItem('sn:skin-v1', id);
            document.documentElement.classList.remove('skin-spacex', 'skin-astranov');
            document.documentElement.classList.add(id === 'astranov' ? 'skin-astranov' : 'skin-spacex');
          }
        } catch (_) {}
        log(id === 'spacex' ? 'SpaceXAI face' : 'Astranov electric (memory restore)', 'ok');
        return;
      }

      if (low === 'theme' || low === 'theme light' || low === 'theme dark' || low === 'theme auto' || low === 'light mode' || low === 'dark mode') {
        // Under SpaceX skin, light/dark color-codes are disabled (black hull only)
        try {
          const skin =
            (global.SNSkin && SNSkin.read && SNSkin.read()) ||
            localStorage.getItem('sn:skin-v1') ||
            'spacex';
          if (skin === 'spacex' || skin === 'spacexai' || !skin) {
            log('SpaceXAI · black hull · no light color codes · skin astranov to restore electric', 'dim');
            return;
          }
        } catch (_) {}
        let mode = 'auto';
        if (/dark/.test(low)) mode = 'dark';
        else if (/light/.test(low)) mode = 'light';
        else if (/auto|system/.test(low)) mode = 'auto';
        try {
          if (mode === 'auto') localStorage.removeItem('sn:theme-v1');
          else localStorage.setItem('sn:theme-v1', mode);
        } catch (_) {}
        try {
          const root = document.documentElement;
          root.classList.remove('theme-light', 'theme-dark');
          if (mode === 'auto') {
            if (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches)
              root.classList.add('theme-light');
            else root.classList.add('theme-dark');
          } else root.classList.add('theme-' + mode);
        } catch (_) {}
        log('Theme · ' + mode + ' · Astranov skin only', 'ok');
        return;
      }

      if (
        low === 'go live' ||
        low === 'live check' ||
        low === 'live status' ||
        low === 'public ready'
      ) {
        const rep =
          (global.SNMarket && SNMarket.goLiveStatus && SNMarket.goLiveStatus()) || {
            summary: 'goLiveStatus missing',
            checks: [],
            blockers: [],
            tips: [],
          };
        log('═══ GO LIVE · delivery marketplace ═══', 'ok');
        (rep.checks || []).forEach(function (c) {
          log((c.ok ? '✓ ' : '✗ ') + c.id + ' · ' + (c.detail || ''), c.ok ? 'ok' : 'err');
        });
        (rep.tips || []).forEach(function (tip) {
          log('· ' + tip, 'dim');
        });
        if (rep.blockers && rep.blockers.length) {
          log('Blockers · ' + rep.blockers.join(' · '), 'err');
        }
        log(rep.summary || (rep.ok ? 'READY' : 'NOT READY'), rep.ok ? 'ok' : 'err');
        log('Live path: locate → fill shops → order me a pizza → driver claims → deliver me', 'dim');
        log('Test only: test ready · test order  |  Exit test: live mode', 'dim');
        log('Auth all users: auth setup (Google origins once)', 'dim');
        return;
      }
      if (low === 'live mode' || low === 'public mode' || low === 'exit test') {
        if (global.SNMarket && SNMarket.setLiveMode) SNMarket.setLiveMode(true);
        log('LIVE MODE ON · no fake kitchen · no free order top-up', 'ok');
        return;
      }
      if (low === 'test mode') {
        if (global.SNMarket && SNMarket.setLiveMode) SNMarket.setLiveMode(false);
        log('TEST MODE ON · sector seed + top-up allowed · type live mode before public', 'dim');
        return;
      }
      if (low === 'cancel order' || low === 'cancel delivery' || low === 'refund order') {
        const r =
          (global.SNProfiles && SNProfiles.cancelOrder && SNProfiles.cancelOrder({})) || {
            ok: false,
            error: 'cancelOrder missing',
          };
        if (r.ok) {
          log(
            'Cancelled · refund ' +
              (global.SNCurrency && SNCurrency.format
                ? SNCurrency.format(r.refund)
                : (r.refund || 0) + ' AC'),
            'ok'
          );
        } else log(r.error || 'nothing to cancel', 'err');
        return;
      }

      if (
        low === 'test ready' ||
        low === 'prepare orders' ||
        low === 'prepare test' ||
        low === 'first test' ||
        low === 'ready orders' ||
        low === 'test prep'
      ) {
        if (!global.SNMarket?.prepareFirstTest) {
          log('Market offline · hard refresh', 'err');
          return;
        }
        log('Preparing system for first test orders…', 'dim');
        const prep = await global.SNMarket.prepareFirstTest({});
        preview(prep.ready ? 'TEST READY' : 'TEST PREP INCOMPLETE');
        return;
      }
      if (
        low === 'test order' ||
        low === 'test pizza' ||
        low === 'run test order' ||
        low.startsWith('test order ')
      ) {
        if (!global.SNMarket?.runTestOrder) {
          log('Market offline · hard refresh', 'err');
          return;
        }
        log('First test order · prepare + pizza pipeline…', 'ok');
        const line = low.startsWith('test order ')
          ? raw.slice(raw.toLowerCase().indexOf('test order') + 'test order'.length).trim()
          : '';
        const r = await global.SNMarket.runTestOrder({
          force: true,
          line: line || undefined,
        });
        if (r.ok) log(r.reply || 'Test order OK', 'ok');
        else log(r.reply || r.error || 'Test order failed', 'err');
        preview(r.ok ? 'TEST ORDER OK' : 'TEST ORDER FAIL');
        return;
      }
      if (low === 'wallet' || low === 'balance' || low === 'fees' || low === 'platform') {
        const C = global.SNCurrency;
        const snap = C?.snapshot?.() || { balance: 0, mined: 0, platformFees: 0 };
        log('Wallet ' + (C?.format?.(snap.balance) || snap.balance + ' S'), 'ok');
        log(
          'Your platform 3% lifetime · ' +
            (C?.format?.(snap.platformFees) || (snap.platformFees || 0) + ' S'),
          'ok'
        );
        log('Mined lifetime ' + (C?.format?.(snap.mined) || snap.mined), 'dim');
        log('Finance menu · tap top-right S balance (not on CLI ribbon)', 'dim');
        global.SNField?.paint?.();
        preview(
          (snap.line || 'wallet') +
            ' · fees ' +
            (C?.format?.(snap.platformFees) || (snap.platformFees || 0) + ' S')
        );
        return;
      }
      if (low === 'finance' || low === 'field' || low === 'ledger') {
        // Open same panel as top-right gadget — never via ribbon buttons
        global.SNField?.openFinance?.();
        log('Finance · opened from money path · or tap top-right S', 'ok');
        return;
      }
      if (low === 'radar') {
        global.SNRadar?.refresh?.();
        log('Radar · Earth ' + (global.SNRadar?.EARTH_KMH || 1671) + ' km/h · blips from shops/places', 'ok');
        return;
      }
      if (low === 'resources' || low === 'resource' || low === 'performance' || low === 'perf') {
        const lines = global.SNResources?.status?.() || ['resources offline'];
        lines.forEach((ln) => log(ln, /FPS|mine|spare/i.test(ln) ? 'ok' : 'dim'));
        global.SNRibbon?.setTask?.('mine');
        preview(global.SNResources?.report?.()?.line || 'resources');
        return;
      }
      if (low === 'mine on' || low === 'mining on' || low === 'mine') {
        if (!global.SNResources?.checkTerms?.()) {
          global.SNField?.showTerms?.();
          log('Accept mesh terms to mine in S', 'dim');
          return;
        }
        global.SNResources?.setMining?.(true);
        log('Mining on · earn S from spare capacity', 'ok');
        global.SNRibbon?.setTask?.('mine');
        return;
      }
      if (low === 'mine off' || low === 'mining off') {
        global.SNResources?.setMining?.(false);
        log('Mining off', 'dim');
        return;
      }
      if (low === 'donate on' || low === 'mesh on' || low === 'seti on') {
        global.SNResources?.setDonate?.(true);
        log('Donate is on. Spare power earns Astra coins. 1 ⭐ = 1 Euro.', 'ok');
        try {
          if (global.SNCurrency && SNCurrency.reward) SNCurrency.reward('donate');
        } catch (_) {}
        return;
      }
      if (low === 'donate off' || low === 'mesh off') {
        global.SNResources?.setDonate?.(false);
        return;
      }
      if (
        low === 'device main' ||
        low === 'role main' ||
        low === 'device secondary' ||
        low === 'role secondary' ||
        low === 'device raid' ||
        low === 'role raid' ||
        low === 'device role' ||
        low === 'harvest role'
      ) {
        const role =
          /raid/.test(low) ? 'raid' : /secondary|hot\s*swap|spare/.test(low) ? 'secondary' : /main/.test(low) ? 'main' : null;
        if (role && global.SNResources?.setDeviceRole) {
          const p = global.SNResources.setDeviceRole(role);
          global.SNResources.setMining?.(true);
          global.SNResources.setDonate?.(true);
          log(
            'Device · ' +
              (p?.label || role) +
              ' · harvest ' +
              Math.round((p?.harvest || 0) * 100) +
              '%' +
              (p?.tjMax != null ? ' · TJ max ' + Math.round(p.tjMax * 100) + '%' : ''),
            'ok'
          );
        } else {
          const cur = global.SNResources?.getDeviceRole?.() || 'main';
          log('Device role · ' + cur + ' · set: device main | device secondary | device raid', 'ok');
        }
        return;
      }
      if (low === 'boost') {
        log('Boost · prefer full FPS while active (3 min soft)', 'ok');
        global.SNResources?.noteFrame?.();
        return;
      }
      if (low === 'solo' || low === 'status') {
        const n = Tasks?.list?.()?.length || 0;
        const build = document.querySelector('meta[name="astranov-build"]')?.content || '?';
        const who = global.SNAuth?.user?.email || 'guest';
        const tier = Globe?.tier || '?';
        const phys = Globe?.getPhysics?.();
        const C = global.SNCurrency;
        log('Astranov SpaceNet · build ' + build + ' · zoom ' + tier, 'ok');
        log('user ' + who + ' · open tasks ' + n, 'ok');
        if (C) {
          log(
            'S (SpaceNets) · index ' +
              C.networkIndex().toFixed(4) +
              ' · 1 S ~ ' +
              (C.quote('EUR') || 0).toFixed(4) +
              ' EUR',
            'ok'
          );
        }
        log(
          'AI ' +
            (global.SNAi ? 'ready' : 'loading') +
            ' · brain ' +
            (global.SNBrain?.version || 'off') +
            (phys ? ' · inertia damp ' + phys.damp : ''),
          'dim'
        );
        log('https://astranov.eu · type rate · brain · verify', 'dim');
        preview('Astranov SpaceNet · ' + tier + ' · ' + n + ' tasks');
        return;
      }
      // SPACENET pilot fly grid
      if (low === 'spacenet' || low === 'fly grid' || low === 'grid' || low === 'pilot grid') {
        const path =
          (global.SPACENET && global.SPACENET.pathString && global.SPACENET.pathString()) ||
          'GLOBAL → NATIONAL → REGIONAL → CITY';
        const tier = Globe?.tier || 'global';
        const z = Globe?.getPhysics?.()?.z;
        log('SPACENET · pilot fly grid · without it flying is not possible', 'ok');
        log('Path · ' + path, 'ok');
        log(
          'You are · ' +
            String(tier).toUpperCase() +
            (z != null ? ' · z=' + Number(z).toFixed(2) : '') +
            ' · single-tap deeper · double-tap out',
          'dim'
        );
        preview('SPACENET · ' + path);
        return;
      }
      // Zoom tiers (SPACENET cells)
      if (low === 'solar' || low === 'zoom solar' || low === 'galaxy') {
        Globe?.goToTier?.('solar');
        log('SPACENET · SOLAR', 'ok');
        return;
      }
      if (low === 'global' || low === 'earth' || low === 'world' || low === 'zoom global' || low === 'zoom earth') {
        global.SNMap?.close?.();
        Globe?.setBody?.('earth');
        Globe?.goToTier?.('global');
        log('SPACENET · GLOBAL · full Earth in space · ISS · constellation', 'ok');
        preview('GLOBAL · full Earth in space');
        return;
      }
      if (low === 'national' || low === 'country' || low === 'zoom national') {
        global.SNMap?.close?.();
        const np = Tasks?.pos || global._snLastPos || { lat: 36.387557, lng: 28.222533 };
        try {
          Globe?.goToPlace?.(np.lat, np.lng, { tier: 'national', pulse: true, label: 'NATIONAL', openMap: false });
        } catch (_) {
          Globe?.goToTier?.('national');
        }
        log('SPACENET · NATIONAL', 'ok');
        return;
      }
      if (low === 'regional' || low === 'region' || low === 'zoom regional') {
        global.SNMap?.close?.();
        Globe?.goToTier?.('regional');
        log('SPACENET · REGIONAL', 'ok');
        return;
      }
      if (low === 'city' || low === 'city map' || low === 'streets' || low === 'street map') {
        const look = (Globe && Globe.viewLatLng && Globe.viewLatLng()) || (Globe && Globe.focusPos && Globe.focusPos());
        const p = look || Tasks?.pos || global._snPhysPos || global._snLastPos || { lat: 36.387557, lng: 28.222533 };
        try { Globe?.goToPlace?.(p.lat, p.lng, { tier: 'city', pulse: true, label: 'CITY', openMap: true }); } catch (_) {}
        try { await global.SNMap?.open?.(p.lat, p.lng, { force: true, zoom: 14, fromLook: true }); } catch (_) {}
        try { if (global.SNCommerce && SNCommerce.ensureSector) await SNCommerce.ensureSector(p.lat, p.lng, { openMap: true }); } catch (_) {}
        log('CITY · ' + Number(p.lat).toFixed(3) + ', ' + Number(p.lng).toFixed(3) + ' · streets', 'ok');
        return;
      }
      if (low === 'shops' || low === 'vendors' || low === 'list shops') {
        const look = (Globe && Globe.viewLatLng && Globe.viewLatLng()) || (Globe && Globe.focusPos && Globe.focusPos());
        const p = look || Tasks?.pos || global._snPhysPos || global._snLastPos || { lat: 36.387557, lng: 28.222533 };
        try { Globe?.goToPlace?.(p.lat, p.lng, { tier: 'city', pulse: true, label: 'SHOPS', openMap: true }); } catch (_) {}
        try { await global.SNMap?.open?.(p.lat, p.lng, { force: true, zoom: 14, fromLook: true }); } catch (_) {}
        try { if (global.SNCommerce && SNCommerce.ensureSector) await SNCommerce.ensureSector(p.lat, p.lng, { openMap: true }); } catch (_) {}
        log('SHOPS · ' + Number(p.lat).toFixed(3) + ', ' + Number(p.lng).toFixed(3) + ' · tap a pin', 'ok');
        return;
      }
      // Surface layers panel / basemap / overlays
      if (
        low === 'layers' ||
        low === 'map layers' ||
        low === 'layer' ||
        /^map\s+layers?$/.test(low)
      ) {
        const p = Tasks?.pos || global._snLastPos || { lat: 36.43, lng: 28.22 };
        if (!global.SNMap?.active) await global.SNMap?.open?.(p.lat, p.lng);
        global.SNMap?.openLayersPanel?.();
        log(
          'Layers · basemap: dark bright sat google traffic · overlays: windy w3w iss sats planes ships',
          'ok'
        );
        return;
      }
      if (/^(map\s+)?(dark|bright|light|sat|satellite|google|traffic|basemap)\b/.test(low) || low === 'map layer') {
        let id = 'dark';
        if (/bright|light/.test(low)) id = 'bright';
        else if (/google/.test(low)) id = 'google';
        else if (/traffic/.test(low)) id = 'traffic';
        else if (/sat/.test(low)) id = 'satellite';
        else if (/dark/.test(low)) id = 'dark';
        else {
          log('Basemap · dark · bright · satellite · google · traffic · or type layers', 'dim');
          return;
        }
        const p = Tasks?.pos || global._snLastPos || { lat: 36.43, lng: 28.22 };
        if (!global.SNMap?.active) await global.SNMap?.open?.(p.lat, p.lng);
        global.SNMap?.setBasemap?.(id, { user: true, log: true });
        return;
      }
      if (
        /^(windy|w3w|what3words|iss|sats?|planes?|aircraft|ships?|roads)\b/.test(low) ||
        /^overlay\s+/.test(low)
      ) {
        const p = Tasks?.pos || global._snLastPos || { lat: 36.43, lng: 28.22 };
        if (!global.SNMap?.active) await global.SNMap?.open?.(p.lat, p.lng);
        let id = null;
        if (/windy/.test(low)) id = 'windy';
        else if (/w3w|what3words/.test(low)) id = 'w3w';
        else if (/\biss\b/.test(low)) id = 'iss';
        else if (/sats?/.test(low)) id = 'sats';
        else if (/planes?|aircraft/.test(low)) id = 'planes';
        else if (/ships?/.test(low)) id = 'ships';
        else if (/roads/.test(low)) id = 'trafficLive';
        if (id && global.SNMap?.toggleOverlay) global.SNMap.toggleOverlay(id);
        else log('Overlays · windy · w3w · iss · sats · planes · ships · roads', 'dim');
        return;
      }


      if (
        low === 'ready score' ||
        low === 'readiness' ||
        low === 'go live status' ||
        low === 'market ready'
      ) {
        try {
          const R = global.SNOrderEngine && SNOrderEngine.readiness && SNOrderEngine.readiness();
          if (!R) {
            log('Order engine loading · hard refresh', 'err');
            return;
          }
          log('READY · ' + R.score + '/100', R.score >= 80 ? 'ok' : 'err');
          (R.checks || []).forEach(function (c) {
            log((c.ok ? '✓ ' : '✗ ') + c.id + (c.detail ? ' · ' + c.detail : ''), c.ok ? 'dim' : 'err');
          });
          preview('Ready ' + R.score + '%');
        } catch (e) {
          log(String(e.message || e), 'err');
        }
        return;
      }
      if (low === 'orders pause' || low === 'pause orders') {
        if (global.SNOrderEngine) SNOrderEngine.setOrdersPaused(true);
        log('Orders PAUSED (kill switch)', 'err');
        return;
      }
      if (low === 'orders resume' || low === 'resume orders') {
        if (global.SNOrderEngine) SNOrderEngine.setOrdersPaused(false);
        log('Orders accepting', 'ok');
        return;
      }
      if (low === 'ledger' || low === 'wallet ledger') {
        try {
          const rows =
            (global.SNCurrency && SNCurrency.ledger && SNCurrency.ledger()) || [];
          log('Ledger · ' + rows.length + ' lines', 'ok');
          rows.slice(-12).forEach(function (r) {
            log(
              (r.kind || '?') +
                ' · ' +
                (r.amount != null ? r.amount : '') +
                (r.why ? ' · ' + r.why : ''),
              'dim'
            );
          });
        } catch (e) {
          log(String(e.message || e), 'err');
        }
        return;
      }
      if (low === 'order events' || low === 'order log') {
        try {
          const ev = (global.SNOrderEngine && SNOrderEngine.events && SNOrderEngine.events()) || [];
          log('Order events · ' + ev.length, 'ok');
          ev.slice(-15).forEach(function (e) {
            log(
              (e.id || '') +
                ' · ' +
                (e.from || '∅') +
                '→' +
                (e.to || '') +
                ' · ' +
                new Date(e.t).toLocaleTimeString(),
              'dim'
            );
          });
        } catch (e2) {
          log(String(e2.message || e2), 'err');
        }
        return;
      }


      
      
      if (low === 'spartan' || low === 'spartan law' || low === 'spartan intelligence') {
        try {
          const L = global.SNSpartan && SNSpartan.LAW;
          if (!L) {
            log('Spartan module loading · hard refresh', 'err');
            return;
          }
          log(L.name + ' · ' + L.creed, 'ok');
          (L.rules || []).forEach(function (r) {
            log('· ' + r, 'dim');
          });
          log('Domains · ' + (SNSpartan.domains() || []).join(' · '), 'dim');
          preview('Spartan');
        } catch (e) {
          log(String(e.message || e), 'err');
        }
        return;
      }
if (
        low === 'fill shops' ||
        low === 'google shops' ||
        low === 'crawl shops' ||
        low === 'scan shops' ||
        low === 'populate shops' ||
        low === 'shops crawl' ||
        /^crawl\s+(shops|vendors|map)/i.test(low)
      ) {
        try {
          if (!global.SNVendorCrawl || !SNVendorCrawl.populate) {
            log('Vendor crawl loading · hard refresh', 'err');
            return;
          }
          log('Crawling OSM + Places + edge for vendor tiles…', 'dim');
          let pos = global._snLastPos;
          if (!pos || pos.lat == null) {
            if (global.SNTaskRunner && SNTaskRunner.locate) {
              const L = await SNTaskRunner.locate();
              pos = L && L.pos;
            }
          }
          const r = await SNVendorCrawl.populate({
            lat: pos && pos.lat,
            lng: pos && pos.lng,
            query: line.replace(/^(fill|google|crawl|scan|populate)\s+shops?/i, '').trim() ||
              'restaurant pizza cafe food',
            openMap: true,
            force: true,
          });
          log(
            r && r.ok
              ? 'Map ready · ' + r.count + ' vendors · order me a pizza'
              : 'Few/no shops · try locate then crawl shops again',
            r && r.ok ? 'ok' : 'err'
          );
          preview(r && r.count ? r.count + ' shops' : 'crawl');
        } catch (e) {
          log('Crawl · ' + (e.message || e), 'err');
        }
        return;
      }

if (
        low === 'mission' ||
        low.startsWith('mission ') ||
        low === 'do task' ||
        low.startsWith('do ') && /\b(order|locate|shops|deliver)\b/.test(low)
      ) {
        try {
          if (!global.SNTaskRunner || !SNTaskRunner.runText) {
            log('Task runner loading · hard refresh', 'err');
            return;
          }
          const payload =
            low === 'mission' || low === 'do task'
              ? 'locate and order me a pizza you judge'
              : line.replace(/^mission\s+/i, '').replace(/^do\s+/i, '');
          log('Mission · running…', 'dim');
          const r = await SNTaskRunner.runText(payload, {});
          if (r && r.summary) {
            String(r.summary)
              .split('\n')
              .slice(0, 14)
              .forEach(function (ln) {
                if (ln.trim()) log(ln.trim(), r.ok ? 'ok' : 'dim');
              });
          } else {
            log((r && r.reply) || (r && r.error) || 'done', r && r.ok ? 'ok' : 'err');
          }
          preview(r && r.ok ? 'Mission OK' : 'Mission');
        } catch (e) {
          log('Mission · ' + (e.message || e), 'err');
        }
        return;
      }

      // ── Street routing self-test (OSRM self-host / gateway / public) ──
      if (
        low === 'route test' ||
        low === 'osrm test' ||
        low === 'routing test' ||
        low === 'test route' ||
        low === 'osrm'
      ) {
        try {
          const R = global.SNRouting;
          if (!R || !R.selfTest) {
            log('Routing module loading · hard refresh', 'err');
            return;
          }
          log('Routing · probing self-host → gateway → public…', 'dim');
          const r = await R.selfTest();
          if (r && r.ok) {
            log(
              'OSRM OK · ' +
                (r.engine || '?') +
                ' · ' +
                r.km +
                ' km · ' +
                r.durationS +
                's · ' +
                r.points +
                ' pts · ' +
                r.ms +
                'ms',
              'ok'
            );
            if (r.engineRoot) log('Engine · ' + r.engineRoot, 'dim');
            const st = R.status && R.status();
            if (st && st.cfg) {
              log(
                'Config · base ' +
                  (st.cfg.osrmBase || '(none)') +
                  ' · gateway ' +
                  (st.cfg.useGateway ? 'on' : 'off'),
                'dim'
              );
            }
            preview('OSRM ' + (r.engine || 'ok'));
          } else {
            log('OSRM FAIL · ' + (r && r.error ? r.error : 'unknown'), 'err');
            preview('OSRM fail');
          }
        } catch (e) {
          log('OSRM · ' + (e.message || e), 'err');
        }
        return;
      }

      // ── Live bridge · agent notes (owner → Grok Build coding agent) ──
      if (
        /^(bridge|live bridge|rockbridge|rock bridge|grok bridge|coding bridge)(\s|$)/i.test(
          low
        ) ||
        /^(is the )?(grok |coding |live )?bridge\b/.test(low) ||
        /\bbridge\b.*\b(work|working|status|ok|test|poll)\b/.test(low) ||
        /\b(work|working|status|ok|test)\b.*\bbridge\b/.test(low) ||
        low === 'bridge test' ||
        low === 'test bridge'
      ) {
        try {
          const B = global.SNLiveBridge;
          if (!B) {
            log('Bridge loading · try again in a second', 'dim');
            return;
          }
          B.start && B.start();
          const wantTest =
            /\btest\b/.test(low) || low === 'bridge test' || low === 'test bridge';
          if (wantTest && B.selfTest) {
            const r = await B.selfTest();
            preview(r && r.ok ? 'Bridge OK' : 'Bridge weak');
            return;
          }
          if (/\bpoll\b/.test(low) && B.poll) await B.poll();
          const st = B.status ? await B.status() : null;
          if (st && st.ok) {
            log(
              'Bridge LIVE · coding agent channel · seq ' +
                (st.lastSeq || st.remote?.seq || 0) +
                ' · notes ' +
                (st.remote?.notes || st.localNotes || 0),
              'ok'
            );
            if (st.remote?.lastNote)
              log('Last remote note · ' + String(st.remote.lastNote).slice(0, 100), 'dim');
            log('Send fixes · agent <text>  ·  fix <text>  ·  note <text>', 'dim');
            log('Self-check · bridge test', 'dim');
          } else {
            log(
              'Bridge · polling · ' +
                (st && st.error ? st.error : 'warming') +
                ' · still save notes with agent <text>',
              'dim'
            );
          }
          preview(st && st.ok ? 'Bridge live' : 'Bridge warming');
        } catch (e) {
          log(String(e.message || e), 'err');
        }
        return;
      }
      if (
        /^(agent|fix|note|for agent|tell agent|ask agent)\b/i.test(low) ||
        /^bridge\s+(note|fix|agent)\b/i.test(low) ||
        /^(tell|ask)\s+(the\s+)?(coding\s+)?agent\b/i.test(low) ||
        /^(send to|message)\s+(agent|bridge|grok build)\b/i.test(low)
      ) {
        const text = line
          .replace(/^(agent|fix|note|for agent|tell agent|ask agent)\s*/i, '')
          .replace(/^bridge\s+(note|fix|agent)\s*/i, '')
          .replace(/^(tell|ask)\s+(the\s+)?(coding\s+)?agent\s*/i, '')
          .replace(/^(send to|message)\s+(agent|bridge|grok build)\s*/i, '')
          .trim();
        if (!text) {
          log('Usage · agent <what to fix>  · e.g. agent top bar money is cut off', 'dim');
          return;
        }
        try {
          if (global.SNLiveBridge && SNLiveBridge.ownerNote) {
            log('Sending note to coding agent · ' + text.slice(0, 80), 'ok');
            const r = await SNLiveBridge.ownerNote(text, { from: 'cli' });
            log(
              r && r.remote
                ? 'Note on live bridge · Grok Build can pick it up'
                : r && r.local
                  ? 'Note saved on device · remote publish soft — try bridge test'
                  : 'Note saved',
              'ok'
            );
          } else {
            const bag = JSON.parse(localStorage.getItem('sn:owner-notes-v1') || '[]');
            bag.unshift({ t: Date.now(), text: text.slice(0, 500) });
            localStorage.setItem('sn:owner-notes-v1', JSON.stringify(bag.slice(0, 40)));
            log('Note saved local · bridge offline', 'dim');
          }
          preview('Agent note saved');
        } catch (e) {
          log(String(e.message || e), 'err');
        }
        return;
      }

      if (low === 'login' || low === 'signin' || low === 'sign in') {
        try {
          if (!global.SNAuth) {
            log('Auth loading · wait a second · try again', 'err');
            return;
          }
          if (global.SNAuth.user) {
            const who =
              global.SNAuth.user.user_metadata?.full_name ||
              global.SNAuth.user.email ||
              'user';
            log('Already signed in · ' + who + ' · opening your tile', 'ok');
            if (global.SNField && SNField.openLoggedInUser) SNField.openLoggedInUser();
            else global.SNTile?.openMe?.();
            return;
          }
          log('Sign in · ASTRANOV · astranov.eu (Google on this site only)', 'ok');
          await global.SNAuth.signInGoogle();
        } catch (e) {
          log(String(e.message || e), 'err');
        }
        return;
      }
      if (low === 'auth setup' || low === 'login setup' || low === 'google setup') {
        const lines =
          (global.SNAuth && SNAuth.setupLines && SNAuth.setupLines()) ||
          ['Auth module loading · try again'];
        lines.forEach((ln) =>
          log(ln, /^AUTH SETUP|^[0-9]\)|^·/.test(ln) ? 'ok' : 'dim')
        );
        preview('auth setup');
        return;
      }
      if (
        low === 'channels' ||
        low === 'channel' ||
        low === 'channel manager' ||
        low === 'platforms'
      ) {
        if (!global.SNChannel) {
          log('Channel manager loading · hard refresh', 'err');
          return;
        }
        SNChannel.statusLines().forEach((ln) => log(ln, /CHANNEL|Linked|Commands/.test(ln) ? 'ok' : 'dim'));
        preview('channels');
        return;
      }
      if (/^link\s+\w+/.test(low)) {
        if (!global.SNChannel) {
          log('Channel manager offline', 'err');
          return;
        }
        const m = line.match(/^link\s+(\w+)\s*(.*)$/i);
        const plat = m && m[1];
        const rest = (m && m[2] && m[2].trim()) || '';
        const p = SNChannel.link(plat, rest, '');
        log(
          'Linked · ' + (p.name || plat) + (p.externalId ? ' · ' + p.externalId : '') + ' · go drive on',
          'ok'
        );
        preview('link ' + plat);
        return;
      }
      if (/^unlink\s+\w+/.test(low)) {
        if (!global.SNChannel) return;
        const plat = low.replace(/^unlink\s+/, '').trim();
        SNChannel.unlink(plat);
        log('Unlinked · ' + plat, 'ok');
        return;
      }
      if (low === 'orchestrate' || /^orchestrate\b/.test(low) || low === 'channel jobs') {
        if (!global.SNChannel) {
          log('Channel manager offline', 'err');
          return;
        }
        const jobs = SNChannel.listJobs().filter((j) => j.status === 'queued' || j.status === 'assigned');
        if (!jobs.length) {
          log('No channel jobs · ingest via link + external push, or order pizza on Astranov', 'dim');
          return;
        }
        const r = await SNChannel.orchestrate(jobs[0]);
        log(r.reply || (r.ok ? 'orchestrated' : r.error), r.ok ? 'ok' : 'err');
        return;
      }
      if (low === 'drivers cargo' || low === 'cargo' || low === 'driver load') {
        const drivers = (global.SNProfiles?.list?.({ role: 'driver' }) || []).filter((d) => d.driverOnline);
        if (!drivers.length) {
          log('No online drivers · go drive on', 'dim');
          return;
        }
        drivers.forEach((d) => {
          const c = (global.SNChannel && SNChannel.cargoLoad(d.id)) || 0;
          const max = d.maxCargo != null ? d.maxCargo : 3;
          log(
            (d.name || d.id) +
              ' · cargo ' +
              c +
              '/' +
              max +
              (c >= max ? ' · FULL' : c === 0 ? ' · free' : ' · light'),
            c >= max ? 'err' : 'ok'
          );
        });
        preview('cargo');
        return;
      }
      if (
        low === 'helper' || low === 'grokbot' || low === 'spacex bot' || low === 'spacexbot' || low === 'sx bot' || low === 'sxbot' ||
        low === 'ironman' ||
        low === 'iron man' ||
        low === 'robot helper' ||
        low.startsWith('helper ')
      ) {
        const H = global.SNHelper;
        if (!H) {
          log('HELPER loading · hard refresh', 'err');
          return;
        }
        if (H.init) H.init();
        const arg = low.replace(/^(helper|ironman|iron man|robot helper)\s*/, '').trim();
        if (arg === 'off' || arg === 'sleep' || arg === 'hide') {
          H.sleep?.();
          try {
            if (H.mindOn) H.mindOn(false);
          } catch (_) {}
          log('HELPER · standby off-screen', 'dim');
          preview('helper off');
          return;
        }
        if (arg === 'mind' || arg === 'listen' || arg === 'talk' || arg === 'ai') {
          if (H.engage) H.engage();
          else H.wake?.({ label: 'UNIT · LISTENING' });
          preview('unit mind');
          return;
        }
        if (arg && !/^(on|wake|come|patrol|sweep|off|sleep|hide|mind|listen|talk|ai)$/.test(arg) && H.askMind) {
          void H.askMind(arg);
          preview('unit mind');
          return;
        }
        if (arg === 'patrol' || arg === 'sweep') {
          H.patrol?.();
          preview('helper patrol');
          return;
        }
        if (arg === 'on' || arg === 'wake' || arg === 'come' || arg === '') {
          H.wake?.({ label: 'HELPER' });
          if (arg === '' || arg === 'on' || arg === 'wake') {
            const pos = global._snLastPos || global._snPhysPos;
            if (pos) H.flyTo?.(pos, { kind: 'summon', label: 'HELPER', detail: 'at your call', status: 'inbound' });
            else H.patrol?.();
          }
          log('SPACEX BOT · silver wings online · gaming character', 'ok');
          preview('helper on');
          return;
        }
        // helper find pizza / helper shops
        if (arg.startsWith('find ') || arg.startsWith('search ')) {
          const q = arg.replace(/^(find|search)\s+/, '');
          const pos = global._snLastPos || global._snPhysPos || { lat: 37.93, lng: 23.75 };
          H.find?.(q, pos);
          preview('helper find ' + q);
          return;
        }
        H.find?.(arg || 'target', global._snLastPos || global._snPhysPos);
        preview('helper');
        return;
      }
      if (
        low === 'gfx' ||
        low === 'graphics' ||
        low === 'ai graphics' ||
        low === 'aigraphics' ||
        /^gfx\b/.test(low)
      ) {
        const G = global.SNAIGraphics || global.AIGraphics;
        if (!G) {
          log('AI Graphics loading · hard refresh', 'err');
          return;
        }
        if (G.init) G.init();
        const arg = low.replace(/^(gfx|graphics|ai graphics|aigraphics)\s*/, '').trim();
        if (arg === 'supreme' || arg === 'balanced' || arg === 'lite' || arg === 'full' || arg === 'low') {
          const m = G.setMode(arg);
          log('AI Graphics · ' + (m?.label || arg) + ' · generative (not polygon assets)', 'ok');
          preview('gfx ' + (m?.id || arg));
          return;
        }
        if (arg === 'pulse' || arg === 'think') {
          G.showNeural?.(true);
          G.setThinkPulse?.(true);
          G.spawnEffect?.(0, 0, 0x4cc9ff, 24, 45);
          setTimeout(() => G.setThinkPulse?.(false), 2000);
          log('Think pulse · neural field', 'ok');
          return;
        }
        if (arg === 'neural on' || arg === 'neural') {
          G.showNeural?.(true);
          log('Neural overlay ON', 'ok');
          return;
        }
        if (arg === 'neural off') {
          G.showNeural?.(false);
          log('Neural overlay off', 'dim');
          return;
        }
        (G.status?.() || ['AI Graphics online']).forEach((ln) =>
          log(ln, /SUPREME|AI Graphics|Modes/.test(ln) ? 'ok' : 'dim')
        );
        preview('gfx');
        return;
      }
      if (low === 'logout' || low === 'signout' || low === 'sign out') {
        if (global.SNAuth?.user) await global.SNAuth.signOut();
        log('Signed out', 'ok');
        return;
      }
      // Place tool: pin (1) · targets (multi/topo) · tile
      if (
        low === 'place' ||
        low === 'pin' ||
        low === 'targets' ||
        low === 'target mode' ||
        low === 'tile mode' ||
        low === 'measure' ||
        low === 'clear targets' ||
        low === 'clear pin' ||
        low === 'clear place' ||
        /^mode\s+(pin|targets|tile)$/.test(low)
      ) {
        const Topo = global.SNTopo;
        if (!Topo) {
          log('Place tool offline · hard refresh', 'err');
          return;
        }
        if (low === 'clear targets') {
          Topo.clear('targets');
          return;
        }
        if (low === 'clear pin') {
          Topo.clear('pin');
          return;
        }
        if (low === 'clear place') {
          Topo.clear('all');
          return;
        }
        if (low === 'measure topo' || low === 'topo') {
          if (Topo.measureTopo) {
            const st = await Topo.measureTopo();
            preview(st.areaLabel || st.path3dLabel || st.count + ' pts');
          } else log('Topo measure offline', 'err');
          return;
        }
        if (low === 'measure') {
          const st = Topo.measure();
          log(
            st.count < 3
              ? 'Targets · ' + st.count + ' · need ≥3 for polygon area'
              : 'Polygon · area ' +
                  st.areaLabel +
                  ' · perimeter ' +
                  st.perimeterLabel +
                  (st.engine ? ' · ' + st.engine : ''),
            st.count >= 3 ? 'ok' : 'dim'
          );
          preview(st.count >= 3 ? st.areaLabel : st.count + ' targets');
          return;
        }
        if (low === 'pin' || low === 'mode pin') {
          Topo.setMode('pin');
          Topo.activate();
          return;
        }
        if (low === 'targets' || low === 'target mode' || low === 'mode targets') {
          Topo.setMode('targets');
          Topo.activate();
          return;
        }
        if (low === 'tile mode' || low === 'mode tile') {
          Topo.setMode('tile');
          Topo.activate();
          return;
        }
        // place / add — open full Add menu
        if (Topo.openAddMenu) Topo.openAddMenu();
        else Topo.activate();
        return;
      }
      if (low === 'add' || low === 'add menu' || low === 'add anything') {
        if (global.SNTopo?.openAddMenu) global.SNTopo.openAddMenu();
        else log('Add menu offline · hard refresh', 'err');
        return;
      }
      if (
        low === 'pilot on' ||
        low === 'autopilot on' ||
        low === 'follow sim' ||
        low === 'camera auto'
      ) {
        global.SNMap?.releasePilot?.();
        return;
      }
      if (
        low === 'pilot off' ||
        low === 'autopilot off' ||
        low === 'hold camera' ||
        low === 'camera hold' ||
        low === 'hold'
      ) {
        global.SNMap?.userHoldCamera?.('cli');
        return;
      }
      if (
        /^locate\s+\S/.test(low) ||
        (/^find\s+\S/.test(low) && low !== 'find me') ||
        /^where\s+is\s+\S/.test(low) ||
        /^where'?s\s+\S/.test(low)
      ) {
        const qFind = line.replace(/^(locate|find|where\s+is|where'?s)\s+(the\s+)?/i, '').trim();
        if (qFind && global.SNSearch && SNSearch.researchFirst) {
          preview('Finding · ' + qFind);
          await SNSearch.researchFirst(qFind, { log: log, preview: preview, forcePlace: true });
          return;
        }
      }
      if (low === 'locate' || low === 'gps' || low === 'where am i' || low === 'find me') {
        activity('locating you…', 'work', { label: 'Locate' });
        preview('GPS…');
        // Real GPS → NATIONAL globe → CITY map zoom → nearby offers/shops
        let pos = await gpsLocate({ allowIp: true, allowSoft: true });
        if (pos && pos.lat != null && isFakeDemoPin(pos.lat, pos.lng, pos)) {
          pos = { lat: null, lng: null, fallback: true, reason: pos.reason || 'fake demo pin rejected' };
        }
        if (pos && pos.lat != null) {
          commitRealGps(pos);
          try {
            if (global.SNTasks && SNTasks.setPos) SNTasks.setPos(pos.lat, pos.lng);
            global._snLastPos = {
              lat: pos.lat,
              lng: pos.lng,
              at: Date.now(),
              source: pos.source || (pos.fallback ? 'soft' : 'gps'),
              real: !pos.fallback,
              accuracy: pos.accuracy,
            };
          } catch (_) {}
          const youLabel = pos.fallback
            ? pos.source === 'ip'
              ? 'YOU · approx'
              : 'YOU · soft'
            : 'YOU · GPS';
          const cityZoom = pos.fallback ? 13 : 16;
          const sleep = (ms) => new Promise(function (r) { setTimeout(r, ms); });

          // 1) NATIONAL on globe so you see country context
          try {
            if (Globe && Globe.goToPlace) {
              Globe.goToPlace(pos.lat, pos.lng, {
                tier: 'national',
                body: 'earth',
                pulse: true,
                label: 'NATIONAL · ' + youLabel,
                openMap: false,
                color: pos.fallback ? 0xffc83d : 0x3d9eff,
              });
            } else if (Globe && Globe.flyNear) {
              Globe.flyNear(pos.lat, pos.lng, 'national');
            }
            log('NATIONAL · ' + pos.lat.toFixed(4) + ', ' + pos.lng.toFixed(4), 'ok');
            preview('NATIONAL');
          } catch (_) {}
          await sleep(650);

          // 2) CITY tier + open street map forced zoom on you
          try {
            if (Globe && Globe.goToPlace) {
              Globe.goToPlace(pos.lat, pos.lng, {
                tier: 'city',
                body: 'earth',
                pulse: true,
                label: youLabel,
                openMap: true,
                color: pos.fallback ? 0xffc83d : 0x3d9eff,
              });
            }
          } catch (_) {}
          try {
            if (global.SNMap && SNMap.open) {
              await SNMap.open(pos.lat, pos.lng, { force: true, zoom: cityZoom });
              await SNMap.ensure?.();
              if (SNMap.markYou) SNMap.markYou(pos.lat, pos.lng, youLabel);
              if (SNMap.fitLatLngs) {
                SNMap.fitLatLngs([{ lat: pos.lat, lng: pos.lng }], {
                  zoom: cityZoom,
                  force: true,
                });
              } else {
                const map = await SNMap.ensure?.();
                map?.setView?.([pos.lat, pos.lng], cityZoom, { animate: true });
              }
            }
          } catch (_) {}
          log(
            'CITY · map zoom ' +
              cityZoom +
              ' · ' +
              pos.lat.toFixed(5) +
              ', ' +
              pos.lng.toFixed(5),
            'ok'
          );
          preview('CITY map');

          // 3) Load real sector + nearby shops/offers around you
          let nearCount = 0;
          try {
            if (global.SNCommerce && SNCommerce.ensureSector) {
              await SNCommerce.ensureSector(pos.lat, pos.lng, { openMap: true });
            } else if (global.SNCommerce && SNCommerce.populateMap) {
              await SNCommerce.populateMap(pos.lat, pos.lng, { openMap: true });
            }
          } catch (eSec) {
            try {
              log('Sector · ' + (eSec && eSec.message ? eSec.message : eSec), 'dim');
            } catch (_) {}
          }
          try {
            if (global.SNSearch && SNSearch.nearby) {
              const near = await SNSearch.nearby(
                pos.lat,
                pos.lng,
                4500,
                'restaurant food cafe shop market'
              );
              nearCount = Array.isArray(near) ? near.length : near && near.length ? near.length : 0;
              if (global.SNMap && SNMap.showProfiles) SNMap.showProfiles();
              if (global.SNMap && SNMap.showTasks) SNMap.showTasks();
            } else if (global.SNSearch && SNSearch.crawl) {
              const crawled = await SNSearch.crawl('shops near me', {
                lat: pos.lat,
                lng: pos.lng,
                openMap: true,
                mode: 'map',
                radiusM: 4500,
              });
              nearCount =
                (crawled && crawled.nearby && crawled.nearby.length) ||
                (crawled && crawled.count) ||
                0;
            }
          } catch (eNear) {
            try {
              log('Nearby scan · ' + (eNear && eNear.message ? eNear.message : eNear), 'dim');
            } catch (_) {}
          }
          try {
            if (global.SNField && SNField.refreshBlips) SNField.refreshBlips();
            if (global.SNField && SNField.refreshRoutes) void SNField.refreshRoutes(true);
            if (global.SNRadarPulse && SNRadarPulse.refresh) SNRadarPulse.refresh();
          } catch (_) {}

          // 4) Surface open offers near you (CLI, map clear)
          let offerN = 0;
          try {
            if (global.SNOfferStack && SNOfferStack.list) {
              const offs = SNOfferStack.list() || [];
              offerN = offs.filter(function (o) {
                if (!o) return false;
                const ph = String(o.phase || o.status || '').toLowerCase();
                if (ph && ph !== 'offered' && ph !== 'open' && ph !== 'claimed' && ph !== 'underway')
                  return false;
                const olat = o.lat != null ? o.lat : o.vendor && o.vendor.lat;
                const olng = o.lng != null ? o.lng : o.vendor && o.vendor.lng;
                if (olat == null || olng == null) return true; // keep global open offers
                return (
                  Math.abs(Number(olat) - pos.lat) < 0.08 &&
                  Math.abs(Number(olng) - pos.lng) < 0.1
                );
              }).length;
            }
          } catch (_) {}

          depict('locate', {
            lat: pos.lat,
            lng: pos.lng,
            label: youLabel,
            tier: 'city',
            allowGlobe: false,
          });

          if (!pos.fallback) {
            log(
              'YOU · GPS · ' +
                pos.lat.toFixed(5) +
                ', ' +
                pos.lng.toFixed(5) +
                (pos.accuracy != null ? ' · ±' + Math.round(pos.accuracy) + ' m' : '') +
                ' · national→city · map on you',
              'ok'
            );
          } else {
            const why =
              pos.source === 'ip'
                ? 'GPS blocked/unavailable · IP city approx (not street-precise)'
                : pos.gpsFailed === 'denied' || pos.reason === 'denied'
                  ? 'location permission denied · allow Location for this site, then Locate again'
                  : pos.gpsFailed === 'timeout' || pos.reason === 'timeout'
                    ? 'GPS timed out · turn on Precise Location · try outdoors'
                    : pos.reason === 'insecure'
                      ? 'location needs https'
                      : 'soft pin · confirm if this is you';
            log(
              why +
                ' · ' +
                pos.lat.toFixed(4) +
                ', ' +
                pos.lng.toFixed(4) +
                (pos.city ? ' · ' + pos.city : ''),
              pos.source === 'ip' ? 'dim' : 'err'
            );
          }
          log(
            'Around you · shops/POI ~' +
              nearCount +
              ' · open offers ' +
              offerN +
              (offerN || nearCount
                ? ' · power ON to take live offers'
                : ' · quiet sector · power ON when activity rises'),
            nearCount || offerN ? 'ok' : 'dim'
          );
          preview(
            nearCount || offerN
              ? 'YOU · ' + (nearCount || offerN) + ' nearby'
              : youLabel
          );
        } else {
          const why =
            pos && pos.reason === 'denied'
              ? 'Location DENIED · open site settings → allow Location · tap Locate again'
              : pos && pos.reason === 'insecure'
                ? 'Need secure https for GPS'
                : pos && pos.reason === 'unsupported'
                  ? 'This browser has no geolocation'
                  : 'Locate failed · allow Location permission · enable GPS · try again';
          log(why, 'err');
          preview('GPS failed');
        }
        return;
      }
      if (
        low === 'global' ||
        low === 'globe' ||
        low === 'earth' ||
        low === 'view global' ||
        low === 'full earth' ||
        low === 'back to earth'
      ) {
        try {
          if (global.SNMap?.close) SNMap.close();
          else if (global.SNMap?.backToGlobe) SNMap.backToGlobe();
        } catch (_) {}
        try {
          Globe?.setBody?.('earth');
          Globe?.goToTier?.('global');
          try { if (global.SNRecover) SNRecover({ closeMap: true }); } catch (_) {}
        } catch (_) {}
        depict('global');
        log('GLOBAL · full Earth in space · map closed', 'ok');
        return;
      }
      if (low === 'city' || low === 'map' || low === 'street' || low === 'city map') {
        const p = Tasks?.pos || global._snLastPos;
        if (!p || p.lat == null || isFakeDemoPin(p.lat, p.lng, p)) {
          log('I need your real place first. Tap locate, then say city.', 'ok');
          return;
        }
        if (p.lat) Tasks?.setPos?.(p.lat, p.lng);
        depict('city', { lat: p.lat, lng: p.lng, label: 'City' });
        try {
          Globe?.goToPlace?.(p.lat, p.lng, { tier: 'city', body: 'earth', pulse: true });
        } catch (_) {}
        await global.SNMap?.open?.(p.lat, p.lng);
        log(
          'city map · ' + Number(p.lat).toFixed(3) + ',' + Number(p.lng).toFixed(3),
          'ok'
        );
        return;
      }
      if (low === 'shops' || low === 'vendors' || low === 'stores') {
        const shopPin = Tasks?.pos || global._snLastPos;
        if (
          !shopPin ||
          shopPin.lat == null ||
          isFakeDemoPin(shopPin.lat, shopPin.lng, shopPin)
        ) {
          log('I need your real place first. Tap locate, then say shops again.', 'ok');
          return;
        }
        activity('shops on map…', 'shops', { label: 'Shops' });
        if (global.SNAi?.ask) {
          const reply = await SNAi.ask(line);
          if (reply) {
            log(reply, 'ok');
            preview(String(reply).slice(0, 80));
          }
          return;
        }
        Globe?.goToTier?.('city');
        const r = await global.SNCommerce?.ensureSector?.(shopPin.lat, shopPin.lng, { openMap: true });
        const vendors = global.SNProfiles?.list?.({ role: 'vendor' }) || [];
        const n = vendors.length || r?.count || 0;
        log(n ? n + ' shops · tap map target for tile' : 'No shops near focus', n ? 'ok' : 'dim');
        preview(n + ' shops');
        return;
      }
      if (
        low === 'google shops' ||
        low === 'google places' ||
        low === 'fill shops' ||
        low === 'fill google'
      ) {
        const p = Tasks?.pos || global._snLastPos || { lat: 36.4341, lng: 28.2176 };
        if (!global.SNPlacesBusiness?.hasKey?.()) {
          log(
            'Set SN_CONFIG.layers.googleMapsKey (Maps JS + Places API) then hard refresh.',
            'err'
          );
          preview('need Google key');
          return;
        }
        activity('Google Places…', 'shops', { label: 'Google' });
        log('Filling shop tiles from Google Places (photos, hours, phone, website)…', 'dim');
        const g = await SNPlacesBusiness.fillSector(p.lat, p.lng, {
          radiusM: 3000,
          limit: 24,
          details: 14,
        });
        try {
          await global.SNMap?.open?.(p.lat, p.lng);
          global.SNMap?.showProfiles?.();
        } catch (_) {}
        log(
          g?.ok
            ? g.count + ' Google shops on map · tap a pin for full tile'
            : 'Google returned no shops · try locate first · check Places API billing',
          g?.ok ? 'ok' : 'err'
        );
        preview((g?.count || 0) + ' Google shops');
        return;
      }
      if (low === 'thesis' || low === 'garage' || low === 'vault') {
        if (low === 'vault') {
          const places = global.SNSpatial?.list?.() || [];
          if (!places.length) {
            log('Vault empty · put places at real body+lat+lng (no seed demos)', 'dim');
          } else {
            places.forEach((p) => {
              log((p.emoji || '📌') + ' ' + (p.title || p.name) + ' · ' + (p.body || 'earth'), 'ok');
            });
          }
          preview('vault');
          return;
        }
        // Real Rhodes garage coords — land + crawl (SPECS P0-D / P1-C)
        log('Garage · Rhodes · live land + crawl', 'dim');
        if (global.SNCosmos?.go) {
          await global.SNCosmos.go('earth', 36.44125, 28.22255, {
            label: 'Garage Rhodes',
            openMap: true,
          });
        } else {
          await global.SNGlobe?.goToPlace?.(36.44125, 28.22255, {
            tier: 'national',
            openMap: true,
            label: 'Garage',
          });
        }
        preview('garage');
        return;
      }
      if (low === 'cosmos' || low === 'bodies' || low === 'planets' || low === 'sky' || low === 'live sky') {
        if (global.SNSkyBodies && SNSkyBodies.logSky) {
          Globe?.goToTier?.('solar');
          SNSkyBodies.logSky();
          preview('live sky · sun moon planets · Astranov above Moon');
          return;
        }
        const list = global.SNCosmos?.list?.() || [];
        list.forEach((b) => log('◎ ' + b.name + ' · go to ' + b.id, 'ok'));
        preview('go to mars · moon · jupiter · earth');
        return;
      }
      // go to <planet|place> — real body switch + land + crawl
      {
        const dest = global.SNCosmos?.parseGo?.(line);
        const directBody =
          !dest && global.SNCosmos?.resolve?.(low) && low !== 'earth'
            ? low
            : null;
        if (dest || directBody || low === 'mars' || low === 'cydonia' || low === 'go to mars') {
          const where = dest || directBody || (low.indexOf('cydonia') >= 0 ? 'cydonia' : 'mars');
          preview('Going · ' + where);
          if (global.SNCosmos?.go) {
            const r = await global.SNCosmos.go(where);
            if (r) log('Arrived · ' + (r.body?.name || where), 'ok');
          } else {
            log('SNCosmos offline · cannot land on ' + where, 'err');
          }
          return;
        }
      }
      if (low === 'earth' || low === 'go to earth' || low === 'back to earth') {
        if (global.SNCosmos?.go) await global.SNCosmos.go('earth', null, null, { tier: 'global' });
        else {
          global.SNMap?.close?.();
          Globe?.setBody?.('earth');
          Globe?.goToTier?.('global');
        }
        log('Earth · GLOBAL SNGlobe', 'ok');
        return;
      }
      if (low === 'globe' || low === 'close map' || low === 'back' || low === 'home') {
        global.SNMap?.close?.();
        if (Globe?.bodyId && Globe.bodyId !== 'earth' && global.SNCosmos?.go) {
          await global.SNCosmos.go('earth');
        } else {
          Globe?.setBody?.('earth');
          Globe?.goToTier?.('global');
        }
        log('Back · ' + (Globe?.bodyId || 'earth') + ' GLOBAL', 'ok');
        return;
      }
      // fly <city> → open that city's street map (user-requested only)
      async function openCityAt(lat, lng, label) {
        Tasks?.setPos?.(lat, lng);
        global._snLastPos = { lat, lng };
        if (Globe?.bodyId && Globe.bodyId !== 'earth') Globe.setBody?.('earth');
        try {
          Globe?.goToPlace?.(lat, lng, {
            tier: 'city',
            label: label,
            body: 'earth',
            pulse: false,
            openMap: false,
          });
        } catch (_) {}
        await global.SNMap?.open?.(lat, lng, { force: true });
        log('City map · ' + label + ' · drag holds camera · pilot on for autopilot', 'ok');
        preview(label);
      }
      for (const [name, ll] of Object.entries(CITIES)) {
        if (new RegExp('^(fly\\s+)?' + name + '$', 'i').test(low) || low === 'fly ' + name) {
          await openCityAt(ll[0], ll[1], name === 'rodos' ? 'Rhodes' : name);
          return;
        }
      }
      if (/^fly\s+/.test(low)) {
        const name = low.replace(/^fly\s+/, '').trim();
        const ll = CITIES[name.replace(/\s+/g, '')] || CITIES[name];
        if (ll) {
          await openCityAt(ll[0], ll[1], name === 'rodos' ? 'Rhodes' : name);
        } else if (global.SNSearch?.geocode) {
          preview('Finding · ' + name);
          const places = await SNSearch.geocode(name);
          if (places?.[0]) {
            const p = places[0];
            await openCityAt(p.lat, p.lng, String(p.name || name).slice(0, 40));
          } else if (global.SNCosmos?.resolve?.(name)) {
            global.SNMap?.close?.();
            await global.SNCosmos.go(name);
          } else log('Unknown · fly athens · fly london · global', 'dim');
        } else log('Unknown place · fly athens · fly london · global', 'dim');
        return;
      }
      if (/^task\s*list$|^list$|^tasks$/.test(low)) {
        const open = Tasks?.list?.({ all: true }) || Tasks?.list?.() || [];
        if (!open.length) {
          log('No open tasks · order food or wait for jobs', 'dim');
        } else {
          open.slice(0, 15).forEach((t) => {
            const en = global.SNTaskBoard?.enrich?.(t);
            const price =
              en?.price != null
                ? global.SNCurrency
                  ? SNCurrency.format(en.price)
                  : en.price.toFixed(2) + ' S'
                : '';
            log(
              (t.status || 'open') +
                ' · ' +
                (price ? price + ' · ' : '') +
                t.title.slice(0, 36) +
                (en ? ' · ' + en.vendorName + ' → ' + en.clientName : ''),
              'ok'
            );
          });
          if (global.SNMap?.active) global.SNMap.showTasks?.();
          preview(open.length + ' tasks · task open / task fit');
        }
        return;
      }
      if (/^task\s*claim|^claim\b/.test(low)) {
        const tid = line.split(/\s+/).find((p) => p.startsWith('t_'));
        const r = Tasks?.claim?.(tid);
        if (r?.ok) {
          log('Claimed · ' + r.task.title, 'ok');
          preview('Claimed · ' + r.task.kind);
          if (global.SNTaskBoard?.openTaskTile) SNTaskBoard.openTaskTile(r.task);
          else if (global.SNMap?.active) global.SNMap.showTasks?.();
        } else log(r?.error || 'claim failed', 'err');
        return;
      }
      if (/^task\s*done|^done\b|^complete\b/.test(low)) {
        const tid = line.split(/\s+/).find((p) => p.startsWith('t_'));
        const r = Tasks?.complete?.(tid);
        if (r?.ok) {
          log('Done · ' + r.task.title, 'ok');
          preview('Completed · ' + r.task.kind);
        } else log(r?.error || 'nothing to complete', 'err');
        return;
      }
      if (/^task\s*catalog|^catalog$|^roles$/.test(low)) {
        (Tasks?.CATALOG || []).forEach((c) => log(c.kind + ' · ' + c.title + ' · ' + c.dur, 'ok'));
        return;
      }
      if (
        /^search\b|^find\b|^google\b|^maps\b|^crawl\b|^where\s+is\b|^look\s+up\b|^show\s+me\b|^zoom\s+to\b|^visualize\b|^look\s+at\b|^take\s+me\s+to\b/.test(
          low
        )
      ) {
        const q =
          line
            .replace(
              /^(search|find|google|maps|crawl|almighty|where\s+is|look\s+up|show\s+me|zoom\s+to|visualize|look\s+at|take\s+me\s+to)\s+/i,
              ''
            )
            .trim() || line;
        try {
          await ensureYoutube();
        } catch (_) {}
        if (global.SNSearch && SNSearch.researchFirst) {
          await SNSearch.researchFirst(q, { log: log, preview: preview });
        } else if (global.SNSearch && SNSearch.crawl) {
          const crawled = await SNSearch.crawl(q, {
            visualize: false,
            fly: false,
            openMap: false,
            quiet: false,
            mode: 'knowledge',
          });
          SNSearch.report?.(crawled, log);
        } else {
          log('Search still loading — try again in a second.', 'dim');
        }
        preview(q.slice(0, 40) || 'research');
        return;
      }
      if (/^research\b/.test(low)) {
        const q = line.replace(/^research\s+/i, '').trim() || 'astranov';
        if (global.SNSearch && SNSearch.researchFirst) {
          await SNSearch.researchFirst(q, { log: log, preview: preview });
        }
        return;
      }
      if (/^code\b|^write\s+code\b|^implement\b|^patch\b/.test(low) || /^coders\b/.test(low)) {
        const ask = line
          .replace(/^(code|write\s+code|implement|patch|coders)\s+/i, '')
          .trim() || line;
        preview('Astranov coding…');
        log('── Astranov (Grok-fork) · code ──', 'dim');
        const reply = global.SNAi?.code
          ? await (low.startsWith('coders') ? SNAi.coders(ask) : SNAi.code(ask))
          : await SNAi?.ask?.(ask, { mode: 'code' });
        if (reply) {
          // Split long code across log lines
          String(reply)
            .split('\n')
            .forEach((ln) => log(ln.slice(0, 200), /```/.test(ln) ? 'dim' : 'ok'));
          preview(reply.slice(0, 80));
        } else log('Code edge offline · try again · brain still holds law', 'err');
        return;
      }
      if (/^date\b|^dating\b|coffee\s*date|dinner\s*date|available\s*woman|meet\s*(a\s*)?woman/.test(low)) {
        if (global.SNMarket?.fulfillDatingIntent) {
          log('Dating · search available · send request…', 'dim');
          const r = await global.SNMarket.fulfillDatingIntent(line);
          log(r?.reply || (r?.ok ? 'Dating request open' : r?.error || 'dating failed'), r?.ok ? 'ok' : 'err');
          preview(r?.best?.name || 'dating');
          return;
        }
        const t = Tasks?.create?.(line);
        log('Date open · ' + t.title, 'ok');
        preview(t.title);
        if (global.SNMap?.active) global.SNMap.showTasks?.();
        return;
      }
      if (/^deliver|^delivery\b|food\s*order|\bpackage\b/.test(low)) {
        const t = Tasks?.create?.(line.includes('deliver') || line.includes('delivery') ? line : 'delivery ' + line);
        log('Delivery open · ' + t.title, 'ok');
        preview(t.title);
        if (global.SNMap?.active) global.SNMap.showTasks?.();
        return;
      }
      if (/^errand\b|pharmacy|grocery\s*run/.test(low)) {
        const t = Tasks?.create?.(line);
        log('Errand open · ' + t.title, 'ok');
        preview(t.title);
        return;
      }
      if (
        /^job\b|^gig\b|^hire\b|barman|bartender|cleaner|nanny|waiter|tutor|need\s+a\b|looking\s+for\s+work/.test(
          low
        )
      ) {
        if (global.SNMarket?.fulfillWorkIntent) {
          log('Work · find best available · send offer…', 'dim');
          const r = await global.SNMarket.fulfillWorkIntent(line);
          log(r?.reply || (r?.ok ? 'Work offer open' : r?.error || 'job failed'), r?.ok ? 'ok' : 'err');
          preview(r?.best?.name || r?.role || 'job');
          return;
        }
        const t = Tasks?.create?.(line);
        log('Job open · ' + t.title, 'ok');
        preview(t.title);
        if (global.SNMap?.active) global.SNMap.showTasks?.();
        return;
      }
      if (low === 'order' || low === 'market' || low === 'checkout' || /^market\b|^checkout\b/.test(low)) {
        const p = Tasks?.pos || global._snLastPos || { lat: 36.43, lng: 28.22 };
        await global.SNMap?.open?.(p.lat, p.lng);
        const r = await global.SNCommerce?.populateMap?.(p.lat, p.lng, { openMap: true });
        log(
          r?.count
            ? 'Market · ' + r.count + ' shops near you'
            : 'Market · no shops here · try fly <city> · shops',
          r?.count ? 'ok' : 'err'
        );
        preview(r?.count ? r.count + ' shops' : 'market');
        return;
      }
      if ((/^help\b|need\s+help|anyone\s+can|can\s+someone/.test(low) && line.length < 120) || low === 'help me') {
        if (low === 'help' || low === 'help me') {
          /* if exact help already handled */ 
        }
        if (low !== 'help' && low !== '?') {
          const t = Tasks?.create?.({ kind: 'help', title: '🤝 ' + line.slice(0, 50), raw: line });
          log('Help open · ' + t.title, 'ok');
          preview(t.title);
          return;
        }
      }
      if (line.length < 100 && /\b(need|want|looking|work|job|date|deliver)\b/i.test(line)) {
        const t = Tasks?.create?.(line);
        log('Posted · ' + t.title, 'ok');
        preview(t.title);
        return;
      }

      // ═══ GAME MODES · Real-Earth theater + cockpit ═══
      if (
        low === 'earth ops' ||
        low === 'earthops' ||
        low === 'ops' ||
        low === 'play levels' ||
        low === 'play level' ||
        low === 'levels' ||
        low === 'gaming' ||
        low === 'game mode' ||
        low === 'orbital' ||
        low === 'high end' ||
        low === 'space scene' ||
        low === 'orbit' ||
        low === 'orbit game' ||
        low === 'space ops' ||
        /^(play|start)\s+(levels?|ops|earth|space|orbit)/i.test(low)
      ) {
        try {
          if (global.SNLoader && SNLoader.ensure) await SNLoader.ensure(['spacescene', 'space-scene', 'earthops', 'helper']);
        } catch (_) {}
        const E = global.SNSpaceScene || global.SNEarthOps;
        if (!E) {
          log('Space scene loading · hard refresh', 'err');
          return;
        }
        if (E.mount) E.mount();
        E.start?.() || E.open?.();
        log('SPACE SCENE · real Earth + outer space ARE the theater', 'ok');
        log('WASD fly · Space fire · Esc exit · orbit beacons · levels Athens → Lunar', 'dim');
        preview('space scene');
        return;
      }
      if (
        low === 'invaders' ||
        low === 'space invaders' ||
        low === 'play invaders' ||
        low === 'cockpit' ||
        low === 'space war' ||
        low === 'arcade' ||
        low === 'play game' ||
        low === 'start game' ||
        low === 'game' ||
        /^(play|start)\s+(the\s+)?(game|invaders|cockpit)/i.test(low)
      ) {
        try {
          if (global.SNLoader && SNLoader.ensure) await SNLoader.ensure(['invaders', 'game']);
        } catch (_) {}
        const I = global.SNInvaders;
        if (!I) {
          log('Invaders loading · hard refresh', 'err');
          return;
        }
        I.init?.();
        I.open?.() || I.start?.();
        log('INVADERS · cockpit mode · tilt / arrows · guns lasers missiles', 'ok');
        preview('invaders');
        return;
      }
      if (low === 'invaders close' || low === 'close game' || low === 'game off' || low === 'ops close' || low === 'earth ops close' || low === 'close ops') {
        try { global.SNInvaders?.close?.(); } catch (_) {}
        try { if (global.SNSpaceScene) { SNSpaceScene.stop?.(); SNSpaceScene.close?.(); } } catch (_) {}
            try { global.SNEarthOps?.close?.(); } catch (_) {}
        log('Game modes closed · Earth online', 'dim');
        preview('Earth');
        return;
      }
      if (low === 'play' || low === 'games' || low === 'game help' || low === 'play help') {
        [
          '═══ ASTRANOV GAME MODES ═══',
          'helper · wake silver-wing SpaceX Bot',
          'helper patrol · wing sweep',
          'space scene / earth ops · orbit theater on real Earth',
          'invaders · cockpit arcade',
          'play game · start invaders',
          'ops close · leave game theater'
        ].forEach((ln, i) => log(ln, i ? 'dim' : 'ok'));
        preview('games');
        return;
      }

      // Research first. Fly / chat only after we know what it is.
      try {
        await ensureYoutube();
      } catch (_) {}
      if (global.SNSearch && typeof SNSearch.researchFirst === 'function') {
        try {
          const sensed = await SNSearch.researchFirst(line, { log: log, preview: preview });
          if (sensed && sensed.acted && sensed.acted.length) return;
        } catch (eRes) {
          log('Search · ' + (eRes && eRes.message ? eRes.message : eRes), 'err');
        }
      }
      if (
        global.SNYoutube &&
        ((SNYoutube.wantsYoutube && SNYoutube.wantsYoutube(line)) ||
          (SNYoutube.looksLikeClipTitle && SNYoutube.looksLikeClipTitle(line)))
      ) {
        await runYoutubeSearch(line);
        return;
      }
      if (global.SNSpaceXai && SNSpaceXai.wantsFly && SNSpaceXai.wantsFly(line)) {
        const flew = await SNSpaceXai.fly(line);
        if (flew && flew.ok) return;
      }

      // Any place-like line lands on Earth / a city / a body — not chat.
      if (looksLikeWorldSearch(low, line) && global.SNSearch?.crawl) {
        preview('Looking on Earth…');
        const crawled = await SNSearch.crawl(line, {
          visualize: true,
          fly: true,
          openMap: true,
          quiet: false,
        });
        const landed =
          (crawled && crawled.body) ||
          (crawled && crawled.focus) ||
          (crawled && crawled.hits && crawled.hits.length) ||
          (crawled && crawled.places && crawled.places[0] && crawled.places[0].lat != null);
        if (landed) {
          SNSearch.report?.(crawled, log);
          preview((crawled.focus && crawled.focus.name) || crawled.body || 'found');
          return;
        }
      }

      // Astranov hands — do the job before chatting
      if (global.SNAi && typeof SNAi.doJob === 'function') {
        const job = await SNAi.doJob(line, { from: 'cli' });
        if (job) {
          preview(String(job).slice(0, 80));
          replyOut(job);
          return;
        }
      }

      // Freeform → OS will reshape first (every user is a developer) · then AI co-dev
      preview('…');
      try {
        if (global.SNOsWill && typeof SNOsWill.reshape === 'function') {
          const willish =
            /\b(theme|dark|light|night|day|accent|color|cli|gadget|power|globe|map|rename|compact|spacious|neon|brightness|prefer|reshape|will|version|fork|density|os)\b/i.test(
              line
            ) ||
            /^(make |set |change |turn |switch |i want |please |can you |let'?s )/i.test(line);
          if (willish) {
            const wr = await SNOsWill.reshape(line, { forceAi: true });
            if (wr && wr.ok && ((wr.ops && wr.ops.length) || wr.meta || wr.forked)) {
              preview('OS reshaped');
              return;
            }
            // if AI text already logged by reshape, still continue for pure chat answers
            if (wr && wr.text && wr.ops && wr.ops.length) {
              preview('OS reshaped');
              return;
            }
          }
        }
      } catch (eWill) {
        try {
          log('WILL · ' + (eWill && eWill.message ? eWill.message : eWill), 'dim');
        } catch (_) {}
      }
      const isDevIntent =
        /\b(coders?|code|fix|build|implement|refactor|debug|deploy|github|api|function|module|class|typescript|javascript|sql|css|html|rewrite|patch|merge|operating system|os will)\b/i.test(
          line
        ) ||
        /^coders\b/i.test(line) ||
        line.length > 100;
      let usedQuick = false;
      if (!isDevIntent) {
        try {
          const mind = global.SNAstranovMind || global.SNFreeMind;
          if (mind && typeof mind.answer === 'function') {
            const quick = mind.answer(line, { mode: 'chat' });
            // High-confidence product intents only (power/locate/help) — do not block Grok chat
            if (
              quick &&
              quick.text &&
              quick.score != null &&
              quick.score >= 0.85 &&
              quick.via &&
              /power|locate|marina|help|plan|subscribe|wallet|skin/i.test(String(quick.via) + String(quick.source || ''))
            ) {
              String(quick.text)
                .split('\n')
                .forEach((ln) => {
                  if (ln.trim()) log(ln, 'ok');
                });
              preview(String(quick.text).replace(/^(SpaceNet|Astranov)\s*[·:.-]\s*/i, '').slice(0, 80));
              replyOut(quick.text);
              usedQuick = true;
            }
          }
        } catch (_) {}
      }
      if (usedQuick) {
        /* done */
      } else {
        let reply = null;
        // 1) Subscription-aware cloud (owner paid Grok · sub budget · free cloud)
        try {
          if (global.SNSubscription && typeof SNSubscription.askPowerful === 'function') {
            const mode = isDevIntent || /^coders\b/i.test(line) ? 'coders' : 'chat';
            const pow = await Promise.race([
              SNSubscription.askPowerful(line, { mode: mode, timeoutMs: 22000 }),
              new Promise((resolve) =>
                setTimeout(function () {
                  resolve({ ok: false, text: null, timeout: true });
                }, 23000)
              ),
            ]);
            if (pow && pow.paywall) {
              preview('subscribe 3');
              reply = null;
              usedQuick = true;
            } else if (pow && pow.ok && pow.text) {
              reply = String(pow.text);
              try {
                if (pow.notice) log(pow.notice, 'dim');
                else if (pow.via) log('via ' + pow.via + (pow.paid ? ' · paid' : ''), 'dim');
              } catch (_) {}
            }
          }
        } catch (ePow) {
          try {
            log('Cloud AI · ' + (ePow.message || ePow), 'dim');
          } catch (_) {}
        }
        // 2) Full SNAi path when loaded
        if (!reply && global.SNAi && SNAi.ask) {
          try {
            reply = await Promise.race([
              isDevIntent && SNAi.coders
                ? SNAi.coders(line)
                : isDevIntent && SNAi.code
                  ? SNAi.code(line)
                  : SNAi.ask(line, { mode: isDevIntent ? 'coders' : 'chat' }),
              new Promise((resolve) =>
                setTimeout(function () {
                  resolve(null);
                }, 20000)
              ),
            ]);
          } catch (_) {}
        }
        // 3) Free mind fallback
        if (!reply) {
          try {
            const mind = global.SNAstranovMind || global.SNFreeMind;
            if (mind && mind.answer) {
              const q = mind.answer(line, { mode: 'chat' });
              if (q && q.text) reply = q.text;
            }
          } catch (_) {}
        }
        if (reply) {
          String(reply)
            .split('\n')
            .forEach((ln) => {
              if (ln.trim()) log(ln, 'ok');
            });
          preview(String(reply).replace(/^(SpaceNet|Astranov)\s*[·:.-]\s*/i, '').slice(0, 80));
          replyOut(reply);
        } else {
          log('Try: power on · locate · marina · plans · subscribe 3 · help', 'ok');
          preview('ready');
        }
      }
    } catch (e) {
      log('Error: ' + (e.message || e), 'err');
    } finally {
      endTurn();
    }
  }

  let speechRec = null;
  let handsfreeOn = false;
  let hfRestartTimer = null;
  let hfLastHeard = 0;
  let hfMutedUntil = 0; // ignore mic while TTS / cooldown (kills feedback loop)
  let hfBusy = false; // one command at a time
  let hfRunTimes = []; // runaway guard
  let hfPending = ''; // last transcript (final or interim) to auto-send
  let hfLastSpoken = ''; // last TTS text for echo cancel
  let hfTtsActive = false;
  /**
   * Talk mode: when AI hands-free is ON, SpaceNet speaks replies (conversation).
   * voice off / hands-free off stops spoken replies. Boot stays silent.
   */
  let hfSpeakOut = false;
  let voicesReady = false;
  const VOICE_KEY = 'sn:tts-speak-v1';
  const VOICE_LANG_KEY = 'sn:voice-lang-v1';

  /**
   * LANGUAGE CORE (owner law):
   * - Start / default ALWAYS English (en-US) for perfect STT+TTS base
   * - Switch to el-GR only when user force (lang el) or last input was clearly Greek
   * - Never follow random OS locale (ru, de…) — that caused Russian self-talk
   */
  function safeVoiceLang() {
    try {
      var forced = '';
      try {
        forced = localStorage.getItem(VOICE_LANG_KEY) || '';
      } catch (_) {}
      if (/^el/i.test(forced)) return 'el-GR';
      if (/^en/i.test(forced) || forced === 'auto' || !forced) {
        // auto: English base; if last user line was Greek script, use Greek STT
        if (forced !== 'el' && global._snLastUserLang === 'el') return 'el-GR';
        return 'en-US';
      }
      return 'en-US';
    } catch (_) {
      return 'en-US';
    }
  }

  function detectUserLang(text) {
    var t = String(text || '');
    if (/[α-ωά-ώΑ-ΩΆ-Ώίϊΐόύϋΰήώ]/.test(t)) return 'el';
    if (/[а-яА-ЯёЁ]/.test(t)) return 'ru';
    if (/^(meow+|miau+|nya+|mew+|purr+)/i.test(t.trim())) return 'meow';
    if (/[a-zA-Z]/.test(t)) return 'en';
    return 'other';
  }

  function noteUserLang(text) {
    try {
      var d = detectUserLang(text);
      if (d === 'el') global._snLastUserLang = 'el';
      else if (d === 'en' || d === 'meow') global._snLastUserLang = 'en';
      else if (d === 'other' || d === 'ru') global._snLastUserLang = 'en'; // reply English base
    } catch (_) {}
  }

  function normVoiceText(t) {
    return String(t || '')
      .toLowerCase()
      .replace(/[^a-z0-9α-ωά-ώίϊΐόύϋΰήώ\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function talking() {
    return !!(handsfreeOn || hfSpeakOut);
  }

  function transcript(who, text) {
    var t = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return;
    if (who === 'you') {
      log('YOU · ' + t, 'cmd');
      preview('YOU · ' + t.slice(0, 48));
    } else {
      String(t)
        .split('\n')
        .forEach(function (ln) {
          if (ln.trim()) log('ASTRANOV · ' + ln.trim(), 'ok');
        });
      preview('ASTRANOV · ' + t.slice(0, 48));
    }
  }

  function setHandsfreeUi(on, label) {
    // Ribbon is the only hands-free control (bottom bar removed)
    const btns = [$('btn-handsfree'), $('sn-rib-hf')].filter(Boolean);
    btns.forEach((btn) => {
      btn.classList.toggle('on', !!on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.title = on
        ? 'Listening · tap AI to stop'
        : 'Talk to Astranov · microphone';
      var em = btn.querySelector('.sn-rib-emoji');
      if (em) em.textContent = on ? '🎙️' : '🎤';
    });
    if (label) preview(label);
  }

  /** Speak AI / system reply during conversation (hands-free or voice on) */
  function replyOut(text) {
    const t = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return;
    if (/[а-яА-ЯёЁ]/.test(t) && global._snLastUserLang !== 'ru') {
      try {
        log('Blocked accidental Russian TTS · English core', 'dim');
      } catch (_) {}
      speakAi("I'm Astranov. English first — I still understand you. How can I help?", true);
      return;
    }
    if (!talking()) {
      transcript('ai', t);
      return;
    }
    speakAi(t);
  }

  function muteMic(ms) {
    hfMutedUntil = Math.max(hfMutedUntil, Date.now() + (ms || 2000));
  }

  function killSpeech() {
    hfTtsActive = false;
    try {
      if (global.speechSynthesis) {
        global.speechSynthesis.cancel();
        try {
          global.speechSynthesis.resume();
        } catch (_) {}
      }
    } catch (_) {}
  }

  function synthSpeaking() {
    try {
      return !!(global.speechSynthesis && global.speechSynthesis.speaking);
    } catch (_) {
      return false;
    }
  }

  function warmVoices() {
    try {
      const synth = global.speechSynthesis;
      if (!synth) return;
      const list = synth.getVoices() || [];
      if (list.length) voicesReady = true;
      if (typeof synth.onvoiceschanged !== 'undefined') {
        synth.onvoiceschanged = function () {
          voicesReady = (synth.getVoices() || []).length > 0;
        };
      }
    } catch (_) {}
  }

  /**
   * Prefer natural EN/EL voices. Hard ban Russian / Cyrillic voices.
   */
  function pickVoice(lang) {
    try {
      const voices = global.speechSynthesis?.getVoices?.() || [];
      if (!voices.length) return null;
      const want = String(lang || 'en-US').toLowerCase();
      const want2 = want.slice(0, 2);
      function score(v) {
        let s = 0;
        const n = String(v.name || '').toLowerCase();
        const l = String(v.lang || '').toLowerCase();
        // HARD BAN russian voices
        if (
          l.indexOf('ru') === 0 ||
          /russian|русский|росси|ирина|милена|павел|дария|виталий|yuri|milena|irina/.test(
            n + ' ' + l
          )
        ) {
          return -999;
        }
        if (l === want) s += 14;
        else if (l.indexOf(want2) === 0) s += 8;
        else if (/^en/.test(l) && want2 === 'en') s += 5;
        else if (/^el/.test(l) && want2 === 'el') s += 5;
        else if (/^en/.test(l)) s += 2; // english always acceptable fallback
        else s -= 20;
        if (/natural|neural|online|premium|enhanced|wavenet|studio|google/.test(n)) s += 18;
        if (
          /aria|jenny|sara|susan|samantha|zira|moira|karen|victoria|linda|emma|sonia|catherine|hazel|google us english|google uk english/.test(
            n
          )
        )
          s += 16;
        if (/female|woman/.test(n)) s += 10;
        if (/david|mark|george|daniel|ravi|microsoft david|espeak|robot|sam\b|fred/.test(n)) s -= 25;
        if (v.localService === false) s += 6;
        return s;
      }
      const ranked = voices.slice().sort(function (a, b) {
        return score(b) - score(a);
      });
      // if best is banned, skip
      for (let i = 0; i < ranked.length; i++) {
        if (score(ranked[i]) > -50) return ranked[i];
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Speak Astranov text in conversation (hands-free / voice on / force test).
   * Never speaks on cold boot — only after user taps AI or says voice on.
   * English/Greek only · mic hard-muted while speaking (no self-listen loop).
   */
  function speakAi(text, force) {
    try {
      if (global.SNSpartan && SNSpartan.compress) text = SNSpartan.compress(text, { max: 90 });
    } catch (_) {}

    if (force !== 'test' && !talking() && force !== true) return;
    try {
      const synth = global.speechSynthesis;
      if (!synth || !global.SpeechSynthesisUtterance) {
        if (force === 'test') log('No speech synthesis · try Chrome/Edge', 'err');
        return;
      }
      // Strip Cyrillic — never speak Russian
      if (/[а-яА-ЯёЁ]/.test(String(text || ''))) {
        text = "I'm Astranov. I only speak English or Greek.";
      }
      warmVoices();
      try {
        synth.resume();
      } catch (_) {}
      const clean = String(text || '')
        .replace(/^SpaceNet\s*[·:.-]\s*/gi, '')
        .replace(/^SPACENET\s*[·:.-]\s*/gi, '')
        .replace(/^Astranov\s*[·:.-]\s*/gi, '')
        .replace(/[🎙➤⋮🏠🎯]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 280);
      if (!clean) return;
      transcript('ai', clean);
      // Abort mic BEFORE speaking — critical anti-echo
      try {
        if (speechRec) speechRec.abort();
      } catch (_) {}
      synth.cancel();
      hfTtsActive = true;
      hfLastSpoken = normVoiceText(clean);
      // Mute for full utterance + buffer (kills listen-to-self)
      muteMic(Math.min(30000, 2800 + clean.length * 70));
      const lang = safeVoiceLang();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = lang;
      u.rate = 0.98;
      u.pitch = 1.05;
      u.volume = 1;
      const voice = pickVoice(lang);
      if (voice) {
        u.voice = voice;
        // Keep lang on safeVoiceLang even if voice reports odd locale
        if (voice.lang && (/^en/i.test(voice.lang) || /^el/i.test(voice.lang))) {
          u.lang = voice.lang;
        } else {
          u.lang = lang;
        }
      }
      u.onend = () => {
        hfTtsActive = false;
        muteMic(1200);
        if (handsfreeOn && !hfBusy) scheduleListenRestart(1200);
      };
      u.onerror = (ev) => {
        hfTtsActive = false;
        try {
          log('Voice error · ' + ((ev && ev.error) || 'speak failed'), 'dim');
        } catch (_) {}
        muteMic(600);
        if (handsfreeOn && !hfBusy) scheduleListenRestart(900);
      };
      setTimeout(function () {
        try {
          // Abort mic again right before speak
          try {
            if (speechRec) speechRec.abort();
          } catch (_) {}
          synth.resume();
          synth.speak(u);
        } catch (e) {
          hfTtsActive = false;
          log('Could not speak · ' + (e.message || e), 'err');
        }
      }, 80);
    } catch (e) {
      hfTtsActive = false;
      try {
        log('Speak failed · ' + (e.message || e), 'err');
      } catch (_) {}
    }
  }

  function scheduleListenRestart(ms) {
    if (hfRestartTimer) clearTimeout(hfRestartTimer);
    hfRestartTimer = setTimeout(() => {
      hfRestartTimer = null;
      if (!handsfreeOn || !speechRec || hfBusy) return;
      if (hfTtsActive || synthSpeaking() || Date.now() < hfMutedUntil) {
        scheduleListenRestart(500);
        return;
      }
      try {
        speechRec.start();
        setHandsfreeUi(true, 'ASTRANOV LISTENING');
      } catch (_) {
        /* already started */
      }
    }, ms || 800);
  }

  function stopHandsfree(reason) {
    handsfreeOn = false;
    hfSpeakOut = false;
    killSpeech();
    hfBusy = false;
    hfPending = '';
    hfTtsActive = false;
    if (hfRestartTimer) {
      clearTimeout(hfRestartTimer);
      hfRestartTimer = null;
    }
    try {
      if (global._snVoiceHoldT) clearTimeout(global._snVoiceHoldT);
    } catch (_) {}
    try {
      if (speechRec) {
        speechRec.onend = null;
        speechRec.onerror = null;
        speechRec.onresult = null;
        speechRec.onstart = null;
        speechRec.abort();
      }
    } catch (_) {}
    speechRec = null;
    try {
      global.speechSynthesis?.cancel?.();
    } catch (_) {}
    setHandsfreeUi(false, reason || 'Hands-free off');
  }

  function isEchoGarbage(t) {
    const low = normVoiceText(t);
    if (low.length < 1) return true;
    // Own TTS / system status
    if (
      /^(spacenet\s*)?listening[.!]?$/.test(low) ||
      /^(astranov\s*)?listening/.test(low) ||
      /^spacenet\s*off[.!]?$/.test(low) ||
      /astranov\s*listening|tap (again|🎙)|hands-?free off|mic (live|denied)/i.test(low)
    )
      return true;
    if (/^astranov(\s+ai)?[.!]?$/i.test(low)) return true;
    if (/^i'?m (here|astranov|listening)/i.test(low)) return true;
    if (/only speak english|english or greek|how can i help/i.test(low)) return true;
    // Echo of last spoken reply (self-listen loop)
    if (hfLastSpoken && low.length >= 4) {
      if (low === hfLastSpoken) return true;
      if (hfLastSpoken.indexOf(low) >= 0 && low.length >= 8) return true;
      if (low.indexOf(hfLastSpoken) >= 0 && hfLastSpoken.length >= 8) return true;
      // token overlap
      var a = low.split(' ').filter(Boolean);
      var b = hfLastSpoken.split(' ').filter(Boolean);
      if (a.length && b.length) {
        var hit = 0;
        a.forEach(function (w) {
          if (w.length > 2 && b.indexOf(w) >= 0) hit++;
        });
        if (hit / Math.min(a.length, b.length) >= 0.55) return true;
      }
    }
    // Accidental Russian from TTS feedback only — real user Russian is allowed
    if (/[а-яА-ЯёЁ]/.test(String(t || '')) && hfLastSpoken && /astranov|english|listening|help/i.test(hfLastSpoken)) {
      log('🎙 ignored Russian echo of English TTS', 'dim');
      return true;
    }
    return false;
  }

  /**
   * Auto-send transcribed voice into CLI conversation (always run — never leave only in input).
   */
  function commitVoice(raw) {
    let t = String(raw || '')
      .replace(/\s+/g, ' ')
      .trim();
    try {
      if (global.ArcangeloDialect && ArcangeloDialect.repairTranscript) {
        t = ArcangeloDialect.repairTranscript(t) || t;
      }
      if (global.SNGreeklish && SNGreeklish.toEnglishCommand) {
        const eng = SNGreeklish.toEnglishCommand(t);
        if (eng) t = eng;
      }
    } catch (_) {}
    if (!t) return false;
    if (hfTtsActive || synthSpeaking()) return false;
    if (Date.now() < hfMutedUntil) return false;
    if (hfBusy) return false;
    if (isEchoGarbage(t)) {
      log('🎙 ignored echo · ' + t.slice(0, 40), 'dim');
      return false;
    }
    noteUserLang(t);
    const now = Date.now();
    if (now - hfLastHeard < 400) return false;
    hfLastHeard = now;
    if (runawayTrip()) return false;

    hfBusy = true;
    hfPending = '';
    muteMic(600);
    try {
      if (speechRec) speechRec.abort();
    } catch (_) {}
    const input = $('cli-in');
    if (input) {
      input.value = t;
    }
    log('YOU · ' + t, 'cmd');
    preview('YOU · ' + t.slice(0, 48));
    global._snVoiceSaid = t;
    void (async () => {
      try {
        try {
          if (global.SNSpartan && SNSpartan.wait) {
            await SNSpartan.wait(
              typeof SNSpartan.thinkDelay === 'function' ? SNSpartan.thinkDelay() : 350
            );
          } else {
            await new Promise(function (r) {
              setTimeout(r, 350);
            });
          }
        } catch (_) {}
        if (input) input.value = '';
        var unitMind = false;
        try {
          unitMind = !!(global.SNHelper && (SNHelper.mindOn === true || (typeof SNHelper.mindOn === 'function' && SNHelper.mindOn())));
        } catch (_) {}
        if (unitMind && global.SNHelper && typeof SNHelper.askMind === 'function') {
          await SNHelper.askMind(t);
        } else if (global.SNFluid && SNFluid.isWish && SNFluid.isWish(t)) {
          await SNFluid.wish(t);
        } else if (looksLikeTalk(t) || /\?$/.test(t) || /^(what|who|why|how|when)\b/i.test(t)) {
          await talkToMind(t);
        } else {
          await run(t);
        }
      } catch (e) {
        log('Voice send · ' + (e.message || e), 'err');
      } finally {
        hfBusy = false;
        if (handsfreeOn) scheduleListenRestart(hfTtsActive || synthSpeaking() ? 1600 : 500);
      }
    })();
    return true;
  }

  function runawayTrip() {
    const now = Date.now();
    hfRunTimes = hfRunTimes.filter((t) => now - t < 15000);
    hfRunTimes.push(now);
    if (hfRunTimes.length >= 14) {
      stopHandsfree('Hands-free auto-stopped (loop guard)');
      log('🎙 Auto-stopped self-loop · type in CLI or tap AI once to listen again', 'err');
      return true;
    }
    return false;
  }

  function toggleHandsfree() {
    if (handsfreeOn) {
      hfSpeakOut = false;
      try {
        localStorage.setItem(VOICE_KEY, '0');
      } catch (_) {}
      killSpeech();
      stopHandsfree('ASTRANOV OFF');
      try {
        if (global.SNAi && SNAi.listeningOff) SNAi.listeningOff();
      } catch (_) {}
      log('Mic off', 'dim');
      preview('MIC OFF');
      return false;
    }
    return startListen();
  }

  function startListen() {
    const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!global.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      log('Mic needs HTTPS.', 'err');
      preview('MIC NEEDS HTTPS');
      return false;
    }
    if (!SR) {
      log('This browser has no speech API. Type in the box.', 'err');
      preview('NO MIC API');
      return false;
    }

    hfSpeakOut = true;
    try {
      localStorage.setItem(VOICE_KEY, '1');
    } catch (_) {}
    handsfreeOn = true;
    hfTtsActive = false;
    hfMutedUntil = 0;
    hfBusy = false;
    hfPending = '';
    hfRunTimes = [];
    killSpeech();

    try {
      if (speechRec) {
        speechRec.onend = null;
        speechRec.abort();
      }
    } catch (_) {}

    // Permission in THIS tap. Do not await — start() must stay in the gesture.
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then(function (stream) {
            try {
              if (global._snMicStream) {
                global._snMicStream.getTracks().forEach(function (t) {
                  try {
                    t.stop();
                  } catch (_) {}
                });
              }
            } catch (_) {}
            global._snMicStream = stream;
          })
          .catch(function (err) {
            log('Mic blocked · click the lock · Allow microphone', 'err');
            preview('MIC BLOCKED');
            stopHandsfree('Mic blocked');
          });
      }
    } catch (_) {}

    speechRec = new SR();
    speechRec.lang = safeVoiceLang();
    speechRec.interimResults = true;
    speechRec.continuous = true;
    speechRec.maxAlternatives = 1;

    speechRec.onstart = function () {
      setHandsfreeUi(true, 'LISTENING');
      preview('LISTENING · speak');
    };

    speechRec.onresult = function (ev) {
      try {
        if (hfTtsActive || synthSpeaking()) return;
        if (Date.now() < hfMutedUntil) return;
        if (hfBusy) return;
        let finalText = '';
        let interimText = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const piece = ev.results[i][0]?.transcript || '';
          if (ev.results[i].isFinal) finalText += piece;
          else interimText += piece;
        }
        const shown = String(finalText || interimText || '').trim();
        if (shown && isEchoGarbage(shown)) {
          hfPending = '';
          return;
        }
        if (shown) {
          hfPending = shown;
          const input = $('cli-in');
          if (input) input.value = shown;
          preview('… ' + shown.slice(0, 48));
        }
        try {
          if (global._snVoiceHoldT) clearTimeout(global._snVoiceHoldT);
        } catch (_) {}
        const fin = String(finalText || hfPending || '').trim();
        if (fin && !isEchoGarbage(fin)) {
          hfPending = fin;
          global._snVoiceHoldT = setTimeout(function () {
            if (hfTtsActive || synthSpeaking() || Date.now() < hfMutedUntil) return;
            const send = String(hfPending || '').trim();
            if (send && handsfreeOn && !hfBusy) commitVoice(send);
          }, 3200);
        }
      } catch (e) {
        log('Voice result · ' + (e.message || e), 'err');
        hfBusy = false;
      }
    };

    speechRec.onerror = function (ev) {
      const code = (ev && ev.error) || 'error';
      if (code === 'aborted') return;
      if (code === 'no-speech') {
        if (handsfreeOn && !hfBusy && !hfTtsActive) scheduleListenRestart(400);
        return;
      }
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        stopHandsfree('Mic blocked');
        log('Mic denied · lock icon · Allow microphone · tap AI again', 'err');
        preview('MIC DENIED');
        return;
      }
      if (code === 'network') log('Voice network · type instead', 'dim');
      if (handsfreeOn && !hfBusy && !hfTtsActive) scheduleListenRestart(600);
    };

    speechRec.onend = function () {
      if (!handsfreeOn) return;
      if (hfBusy || hfTtsActive || synthSpeaking() || Date.now() < hfMutedUntil) {
        scheduleListenRestart(900);
        return;
      }
      scheduleListenRestart(450);
    };

    setHandsfreeUi(true, 'LISTENING');
    log('Listening · speak. Your words and my answers print here.', 'ok');
    preview('LISTENING');
    try {
      speechRec.start();
    } catch (e) {
      scheduleListenRestart(200);
    }
    try {
      if (global.SNAi && SNAi.listeningOn) SNAi.listeningOn();
    } catch (_) {}
    try {
      if (global.SNHelper && SNHelper.wake)
        SNHelper.wake({ force: true, label: 'UNIT · LISTENING', showcaseMs: 20000 });
    } catch (_) {}
    return true;
  }

  function init() {
    if (init._ready) {
      bindCliForm();
      return;
    }
    init._ready = true;
    // Always kill orphan TTS from prior tab / autoplay — first boot only
    killSpeech();
    hfSpeakOut = false;
    handsfreeOn = false;
    try {
      if (!localStorage.getItem(VOICE_LANG_KEY)) localStorage.setItem(VOICE_LANG_KEY, 'en');
      global._snLastUserLang = 'en';
    } catch (_) {}
    bindCliForm();
  }

  function bindCliForm() {
    const form = $('cli-form');
    const input = $('cli-in');
    const topForm = $('stc-cmd');
    const topIn = $('stc-cmd-in');
    if (!form || !input) return;
    if (form._snBound) return;
    form._snBound = true;
    function syncInputs(from) {
      var a = $('cli-in');
      var b = $('stc-cmd-in');
      if (!a || !b) return;
      if (from === a && b.value !== a.value) b.value = a.value;
      if (from === b && a.value !== b.value) a.value = b.value;
    }
    function submitLine(el) {
      const v = (el && el.value) || '';
      if (input) input.value = '';
      if (topIn) topIn.value = '';
      if (input) input.classList.remove('searching');
      if (topIn) topIn.classList.remove('searching');
      try {
        noteUserLang(v);
      } catch (_) {}
      const runner = (global.SNCli && typeof SNCli.run === 'function') ? SNCli.run.bind(SNCli) : run;
      void runner(v);
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitLine(input);
    });
    if (topForm && topIn && !topForm._snBound) {
      topForm._snBound = true;
      topForm.addEventListener('submit', (e) => {
        e.preventDefault();
        submitLine(topIn);
      });
      topIn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitLine(topIn);
        }
      });
      topIn.addEventListener('input', () => {
        syncInputs(topIn);
        input.dispatchEvent(new Event('input'));
      });
    }
    $('btn-send')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      form.requestSubmit?.() || form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
    const hf = $('btn-handsfree');
    if (hf && !hf._snHf) {
      hf._snHf = true;
      hf.type = 'button';
      hf.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleHandsfree();
        },
        true
      );
    }
    // Live feed search while typing / or ?
    input.addEventListener('input', () => {
      try {
        const b = $('stc-cmd-in');
        if (b && b.value !== input.value) b.value = input.value;
      } catch (_) {}
      const v = input.value || '';
      if (/^[/？?]/.test(v) || /^search\s+/i.test(v)) {
        input.classList.add('searching');
        const q = v.replace(/^search\s+/i, '').replace(/^[/？?]\s*/, '');
        applyFeedFilter(q);
        preview(q ? 'Searching feed…' : 'Type to search feed history');
      } else if (feedFilter) {
        input.classList.remove('searching');
        applyFeedFilter('');
        preview('Talk to SpaceNet…');
      } else {
        input.classList.remove('searching');
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (histIdx > 0) {
          histIdx--;
          input.value = hist[histIdx] || '';
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (histIdx < hist.length - 1) {
          histIdx++;
          input.value = hist[histIdx] || '';
        } else {
          histIdx = hist.length;
          input.value = '';
        }
      } else if (e.key === 'Escape') {
        if (feedFilter || /^[/？?]/.test(input.value || '')) {
          e.preventDefault();
          input.value = '';
          input.classList.remove('searching');
          applyFeedFilter('');
          preview('Talk to SpaceNet…');
          return;
        }
        if (global.SNMap?.active) global.SNMap.backToGlobe?.() || global.SNMap.close?.();
        else global.SNMap?.close?.();
      }
    });
    // Edge buttons may be hidden — ribbon owns tools; keep aliases if present
    $('btn-locate')?.addEventListener('click', () => void run('locate'));
    $('btn-help')?.addEventListener('click', () => void run('help'));
    $('btn-earth')?.addEventListener('click', () => void run('earth'));
    feedBox();
    // Empty feed until YOU speak — live idle
    setActivity('idle');
    setLive(false);
    preview('');
    try {
      document.querySelectorAll('#cli-log .cli-tile-block').forEach((el) => el.remove());
    } catch (_) {}
    warmVoices();
    setTimeout(() => {
      try {
        if (global.SNAi?.bootPresence && !global.SNAi.history?.length) SNAi.bootPresence();
      } catch (_) {}
    }, 900);
  }

  global.SNCli = {
    init,
    run,
    log,
    ops,
    help,
    preview,
    appendTilePost,
    applyFeedFilter,
    feedBox,
    beginTurn,
    endTurn,
    inTurn,
    activity,
    depict,
    setActivity,
    setLive,
    userFace,
    gpsLocate,
    commitRealGps,
    isFakeDemoPin,
    ipApproxLocate,
    toggleHandsfree,
    startListen,
    speakAi,
    stopHandsfree,
    get handsfreeOn() {
      return handsfreeOn;
    },
    get hfTtsActive() {
      return hfTtsActive;
    },
  };
})(window);
