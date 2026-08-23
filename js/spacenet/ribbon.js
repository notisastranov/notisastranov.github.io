/**
 * SNRibbon — CLI button ribbon (horizontal scroll + left/right arrows · long-press throw-away · user-created)
 *
 * OWNER LAW 2026-08-10 (layout-safe):
 * - Never hide overflow buttons. Horizontal track + visible left/right arrows when overflowing.
 * - Long-press + fling/drag down toward CLI = remove (Android home-screen style).
 * - User / AI can add buttons via CLI or natural language.
 * - CRITICAL: ribbon max-height stays small so #cli-form and expand handle always remain visible.
 *
 * Mechanical: window.SNRibbon
 * Storage: sn:ribbon-layout-v1 · sn:ribbon-custom-v1 · sn:ribbon-hidden-v1
 */
(function (global) {
  'use strict';

  var LS_LAYOUT = 'sn:ribbon-layout-v1';
  var LS_CUSTOM = 'sn:ribbon-custom-v1';
  var LS_HIDDEN = 'sn:ribbon-hidden-v1';
  var LONG_MS = 480;
  var THROW_DY = 48;

  var CATALOG = {
    power: { id: 'power', emoji: '⏻', label: 'Power', cmd: 'power', title: 'Market on/off' },
    poly: { id: 'poly', emoji: '⬠', label: 'Poly', cmd: 'poly', title: 'Polygon overview · GPS drive cycle' },
    locate: { id: 'locate', emoji: '◎', label: 'Locate', cmd: 'locate', title: 'GPS · recenter' },
    marina: { id: 'marina', emoji: '⚓', label: 'Marina', cmd: 'marina', title: 'Berths & parking' },
    hf: { id: 'hf', emoji: '🎙', label: 'AI', cmd: 'voice', title: 'Talk to Astranov' },
    tour: { id: 'tour', emoji: '🗺', label: 'Tour', cmd: 'tour', title: 'Active multi-stop tour' },
    market: { id: 'market', emoji: '◈', label: 'Market', cmd: 'help market', title: 'Delivery help' },
    plans: { id: 'plans', emoji: '✦', label: 'Plans', cmd: 'plans', title: 'AI subscription' },
    pool: { id: 'pool', emoji: '⇄', label: 'Pool', cmd: 'pool', title: 'Reassignment pool' },
    wallet: { id: 'wallet', emoji: 'S', label: 'Wallet', cmd: 'wallet', title: 'Balance' },
    global: { id: 'global', emoji: '🌍', label: 'Earth', cmd: 'global', title: 'Full globe' },
    help: { id: 'help', emoji: '?', label: 'Help', cmd: 'help', title: 'Commands' },
    radar: { id: 'radar', emoji: '📡', label: 'Radar', cmd: 'radar', title: 'Driver radar' },
    offers: { id: 'offers', emoji: '◇', label: 'Offers', cmd: 'throw tiles', title: 'Throw one test offer' },
    rest: { id: 'rest', emoji: '⏸', label: 'Rest', cmd: 'power off', title: 'Stop market · rest · reassign pool' },
    timeline: { id: 'timeline', emoji: '⏱', label: 'Past', cmd: 'past orders', title: 'Map timeline · past orders' },
    call: { id: 'call', emoji: '📹', label: 'Call', cmd: 'call', title: 'Sealed call only if order off-limits' },
  };

  var DEFAULT_ORDER = [
    'power', 'poly', 'locate', 'marina', 'hf', 'tour', 'market', 'offers', 'pool', 'plans'
  ];

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 200), c || 'ok', true);
    } catch (_) {}
  }

  function loadJSON(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || 'null');
      return v != null ? v : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (_) {}
  }

  function ensureCss() {
    if (document.getElementById('sn-ribbon-css')) return;
    var st = document.createElement('style');
    st.id = 'sn-ribbon-css';
    st.textContent =
      '#sn-task-ribbon{' +
      'position:relative;display:flex!important;flex-direction:row;flex-wrap:nowrap;align-items:center;' +
      'gap:0;padding:4px 28px 4px 28px;flex:0 0 auto;flex-shrink:0;' +
      'max-height:52px;overflow:hidden;' +
      'background:linear-gradient(180deg,rgba(4,22,48,.88),rgba(2,10,24,.65));' +
      'border-bottom:1px solid rgba(61,184,255,.22);' +
      'touch-action:pan-x;}' +
      '#sn-task-ribbon .sn-rib-track{' +
      'display:flex;flex-wrap:nowrap;align-items:center;gap:5px;' +
      'overflow-x:auto;overflow-y:hidden;scroll-behavior:smooth;' +
      '-webkit-overflow-scrolling:touch;scrollbar-width:none;' +
      'flex:1 1 auto;min-width:0;padding:2px 0;}' +
      '#sn-task-ribbon .sn-rib-track::-webkit-scrollbar{display:none;}' +
      '#sn-task-ribbon .sn-rib-btn{' +
      'position:relative;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;' +
      'gap:1px;flex:0 0 auto;min-width:44px;width:48px;height:40px;padding:2px 4px;' +
      'border:1px solid rgba(61,184,255,.32);border-radius:999px!important;' +
      'background:linear-gradient(165deg,rgba(12,40,78,.6),rgba(3,14,32,.92));' +
      'color:#cfe8ff;cursor:pointer;user-select:none;-webkit-user-select:none;' +
      'box-shadow:inset 0 1px 0 rgba(168,236,255,.08);' +
      'transition:transform .12s,opacity .15s,box-shadow .15s;}' +
      '#sn-task-ribbon .sn-rib-btn .sn-rib-emoji{font-size:13px;line-height:1;display:block;}' +
      '#sn-task-ribbon .sn-rib-btn .sn-rib-txt{' +
      'font:700 8px/1 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#b8dcff;' +
      'max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '#sn-task-ribbon .sn-rib-btn:active{transform:scale(.95);}' +
      '#sn-task-ribbon .sn-rib-btn.on{border-color:#3d9eff;box-shadow:0 0 12px rgba(61,158,255,.4);}' +
      '#sn-task-ribbon .sn-rib-btn.sn-rib-wiggle{animation:sn-rib-wiggle .35s ease-in-out infinite alternate;}' +
      '#sn-task-ribbon .sn-rib-btn.sn-rib-throwing{opacity:.3;transform:translateY(40px) scale(.8);pointer-events:none;}' +
      '#sn-task-ribbon .sn-rib-btn.sn-rib-custom{border-style:dashed;border-color:rgba(61,220,160,.4);}' +
      '@keyframes sn-rib-wiggle{from{transform:rotate(-1.5deg)}to{transform:rotate(1.5deg)}}' +
      '#sn-task-ribbon .sn-rib-arrow{' +
      'position:absolute;top:50%;transform:translateY(-50%);z-index:2;' +
      'width:22px;height:32px;border:0;border-radius:999px;cursor:pointer;' +
      'background:rgba(8,28,64,.92);color:#7ec8ff;font:700 14px/1 system-ui;' +
      'display:none;align-items:center;justify-content:center;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.35);}' +
      '#sn-task-ribbon .sn-rib-arrow.left{left:4px;}' +
      '#sn-task-ribbon .sn-rib-arrow.right{right:4px;}' +
      '#sn-task-ribbon.has-overflow .sn-rib-arrow{display:flex;}' +
      '#sn-task-ribbon .sn-rib-arrow:active{background:rgba(20,50,100,.95);}' +
      '#panel{display:flex!important;flex-direction:column!important;}' +
      '#cli-drag{flex:0 0 auto!important;min-height:18px;}' +
      '#cli-form{flex:0 0 auto!important;display:flex!important;}' +
      '#cli-in{flex:1 1 auto!important;min-width:0!important;}' +
      '#cli-log{flex:1 1 auto;min-height:0;}' +
      '#panel.collapsed #sn-task-ribbon{max-height:48px;}' +
      '#panel.collapsed #cli-log:empty{display:none;}' +
      '#sn-rib-ghost{' +
      'position:fixed;z-index:99999;pointer-events:none;opacity:.9;' +
      'border-radius:999px;padding:6px 10px;font:700 11px system-ui;' +
      'background:rgba(8,28,64,.94);border:1px solid #3d9eff;color:#fff;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.45);}';
    document.head.appendChild(st);
  }

  function getHidden() {
    var h = loadJSON(LS_HIDDEN, []);
    return Array.isArray(h) ? h : [];
  }

  function setHidden(arr) {
    saveJSON(LS_HIDDEN, arr);
  }

  function getCustom() {
    var c = loadJSON(LS_CUSTOM, []);
    return Array.isArray(c) ? c : [];
  }

  function setCustom(arr) {
    saveJSON(LS_CUSTOM, arr);
  }

  function getOrder() {
    var o = loadJSON(LS_LAYOUT, null);
    if (Array.isArray(o) && o.length) return o;
    return DEFAULT_ORDER.slice();
  }

  function setOrder(arr) {
    saveJSON(LS_LAYOUT, arr);
  }

  function resolveDef(id) {
    if (CATALOG[id]) return Object.assign({}, CATALOG[id]);
    var customs = getCustom();
    for (var i = 0; i < customs.length; i++) {
      if (customs[i].id === id) return Object.assign({ custom: true }, customs[i]);
    }
    return null;
  }

  function visibleIds() {
    var hidden = getHidden();
    var order = getOrder();
    var customs = getCustom();
    var ids = [];
    order.forEach(function (id) {
      if (hidden.indexOf(id) >= 0) return;
      if (resolveDef(id)) ids.push(id);
    });
    customs.forEach(function (c) {
      if (!c || !c.id) return;
      if (hidden.indexOf(c.id) >= 0) return;
      if (ids.indexOf(c.id) < 0) ids.push(c.id);
    });
    return ids;
  }

  function runCmd(cmd) {
    var c = String(cmd || '').trim();
    if (!c) return;
    try {
      if (c === 'voice' || c === 'hf' || c === 'handsfree') {
        if (global.SNCli && typeof SNCli.toggleHandsfree === 'function') {
          SNCli.toggleHandsfree();
          return;
        }
      }
      if (c === 'power' || c === 'power toggle') {
        if (global.SNField && SNField.setLaunchMode) {
          var cur = (SNField.launchMode && SNField.launchMode()) || 'off';
          SNField.setLaunchMode(cur === 'on' ? 'off' : 'on', {});
          return;
        }
      }
      if (c === 'poly' || c === 'polygon') {
        if (global.SNField && SNField.cyclePolyNav) {
          void SNField.cyclePolyNav();
          return;
        }
      }
      if (global.SNCli && typeof SNCli.run === 'function') {
        void SNCli.run(c);
        return;
      }
      log('› ' + c, 'cmd');
    } catch (e) {
      log(String(e.message || e), 'err');
    }
  }

  function dismiss(id) {
    id = String(id || '').trim();
    if (!id) return false;
    var hidden = getHidden();
    if (hidden.indexOf(id) < 0) {
      hidden.push(id);
      setHidden(hidden);
    }
    var order = getOrder().filter(function (x) {
      return x !== id;
    });
    setOrder(order);
    paint();
    log('Ribbon · threw away · ' + id + ' · restore: button restore ' + id, 'dim');
    return true;
  }

  function restore(id) {
    id = String(id || '').trim();
    if (!id) return false;
    var hidden = getHidden().filter(function (x) {
      return x !== id;
    });
    setHidden(hidden);
    var order = getOrder();
    if (order.indexOf(id) < 0) {
      order.push(id);
      setOrder(order);
    }
    paint();
    log('Ribbon · restored · ' + id, 'ok');
    return true;
  }

  function addButton(opts) {
    opts = opts || {};
    var id = String(opts.id || opts.label || 'btn')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    if (!id) id = 'btn' + Math.random().toString(36).slice(2, 6);
    var label = String(opts.label || id).slice(0, 12);
    var emoji = String(opts.emoji || '•').slice(0, 4);
    var cmd = String(opts.cmd || opts.command || id).trim();
    var title = String(opts.title || cmd).slice(0, 80);

    if (CATALOG[id]) {
      restore(id);
      return { ok: true, id: id, catalog: true };
    }

    var customs = getCustom().filter(function (c) {
      return c && c.id !== id;
    });
    customs.push({ id: id, label: label, emoji: emoji, cmd: cmd, title: title, custom: true });
    setCustom(customs);

    var hidden = getHidden().filter(function (x) {
      return x !== id;
    });
    setHidden(hidden);

    var order = getOrder();
    if (order.indexOf(id) < 0) {
      order.push(id);
      setOrder(order);
    }
    paint();
    log('Ribbon · added · ' + label + ' → ' + cmd, 'ok');
    return { ok: true, id: id, custom: true };
  }

  function bindThrow(btn, id) {
    var timer = null;
    var startX = 0;
    var startY = 0;
    var armed = false;
    var tracking = false;

    function clearT() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function onDown(e) {
      var pt = e.touches && e.touches[0] ? e.touches[0] : e;
      startX = pt.clientX;
      startY = pt.clientY;
      armed = false;
      tracking = true;
      clearT();
      timer = setTimeout(function () {
        armed = true;
        btn.classList.add('sn-rib-wiggle');
        try {
          if (navigator.vibrate) navigator.vibrate(18);
        } catch (_) {}
      }, LONG_MS);
    }

    function onMove(e) {
      if (!tracking) return;
      var pt = e.touches && e.touches[0] ? e.touches[0] : e;
      var dx = pt.clientX - startX;
      var dy = pt.clientY - startY;
      if (!armed && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
        clearT();
      }
      if (armed && dy > THROW_DY) {
        e.preventDefault();
        btn.classList.add('sn-rib-throwing');
        tracking = false;
        clearT();
        setTimeout(function () {
          dismiss(id);
        }, 160);
      }
    }

    function onUp(e) {
      clearT();
      btn.classList.remove('sn-rib-wiggle');
      if (!tracking) return;
      tracking = false;
      if (armed) {
        var pt = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e;
        var dy = (pt.clientY || 0) - startY;
        if (dy > THROW_DY * 0.6) {
          btn.classList.add('sn-rib-throwing');
          setTimeout(function () {
            dismiss(id);
          }, 120);
          return;
        }
        armed = false;
        return;
      }
      var def = resolveDef(id);
      if (def && def.cmd) runCmd(def.cmd);
    }

    function onCancel() {
      clearT();
      tracking = false;
      armed = false;
      btn.classList.remove('sn-rib-wiggle');
    }

    btn.addEventListener('pointerdown', onDown, { passive: true });
    btn.addEventListener('pointermove', onMove, { passive: false });
    btn.addEventListener('pointerup', onUp, { passive: true });
    btn.addEventListener('pointercancel', onCancel, { passive: true });
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); }, true);
  }

  function paint() {
    ensureCss();
    var root = document.getElementById('sn-task-ribbon');
    if (!root) return;
    root.innerHTML = '';
    root.removeAttribute('hidden');
    root.setAttribute('aria-label', 'Quick actions · swipe or use arrows · long-press + throw down to remove');

    var leftBtn = document.createElement('button');
    leftBtn.type = 'button';
    leftBtn.className = 'sn-rib-arrow left';
    leftBtn.setAttribute('aria-label', 'Scroll left');
    leftBtn.textContent = '‹';
    var rightBtn = document.createElement('button');
    rightBtn.type = 'button';
    rightBtn.className = 'sn-rib-arrow right';
    rightBtn.setAttribute('aria-label', 'Scroll right');
    rightBtn.textContent = '›';

    var track = document.createElement('div');
    track.className = 'sn-rib-track';

    var ids = visibleIds();
    ids.forEach(function (id) {
      var def = resolveDef(id);
      if (!def) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sn-rib-btn' + (def.custom ? ' sn-rib-custom' : '');
      btn.id = 'sn-rib-' + id;
      btn.setAttribute('data-rib-id', id);
      btn.title = (def.title || def.label || id) + ' · hold + throw down to remove';
      btn.innerHTML =
        '<span class="sn-rib-emoji" aria-hidden="true">' +
        (def.emoji || '•') +
        '</span><span class="sn-rib-txt">' +
        (def.label || id) +
        '</span>';
      bindThrow(btn, id);
      track.appendChild(btn);
    });

    root.appendChild(leftBtn);
    root.appendChild(track);
    root.appendChild(rightBtn);

    function updateArrows() {
      var overflow = track.scrollWidth > track.clientWidth + 4;
      root.classList.toggle('has-overflow', overflow);
      leftBtn.style.opacity = track.scrollLeft > 4 ? '1' : '0.35';
      rightBtn.style.opacity =
        track.scrollLeft + track.clientWidth < track.scrollWidth - 4 ? '1' : '0.35';
    }
    leftBtn.onclick = function (e) {
      e.stopPropagation();
      track.scrollBy({ left: -120, behavior: 'smooth' });
    };
    rightBtn.onclick = function (e) {
      e.stopPropagation();
      track.scrollBy({ left: 120, behavior: 'smooth' });
    };
    track.addEventListener('scroll', updateArrows, { passive: true });
    setTimeout(updateArrows, 40);
    global.addEventListener('resize', function () {
      setTimeout(updateArrows, 80);
    }, { passive: true });
  }

  function parseNatural(raw) {
    var t = String(raw || '').trim();
    var low = t.toLowerCase();
    if (!low) return null;

    var mRm = low.match(
      /\b(?:remove|delete|throw\s*away|hide|get\s*rid\s*of)\s+(?:the\s+)?(?:button\s+)?([a-z0-9_-]{2,24})\b/
    );
    if (mRm && /\bbutton\b|\bribbon\b/.test(low)) {
      return { ok: true, action: 'remove', id: mRm[1] };
    }
    if (/\b(?:throw\s+away|remove)\s+(?:the\s+)?([a-z0-9_-]+)\s+button\b/.test(low)) {
      var id2 = low.match(/\b(?:throw\s+away|remove)\s+(?:the\s+)?([a-z0-9_-]+)\s+button\b/)[1];
      return { ok: true, action: 'remove', id: id2 };
    }

    if (/\brestore\s+all\s+buttons\b|\bshow\s+all\s+ribbon\b/.test(low)) {
      return { ok: true, action: 'restore_all' };
    }
    var mRes = low.match(/\brestore\s+(?:the\s+)?(?:button\s+)?([a-z0-9_-]{2,24})\b/);
    if (mRes) return { ok: true, action: 'restore', id: mRes[1] };

    if (
      !/\b(add|put|create|make|place)\b/.test(low) ||
      !/\b(button|ribbon|shortcut)\b/.test(low)
    ) {
      return null;
    }

    var map = {
      power: 'power', poly: 'poly', polygon: 'poly', locate: 'locate', gps: 'locate',
      marina: 'marina', berth: 'marina', ai: 'hf', voice: 'hf', mic: 'hf',
      tour: 'tour', market: 'market', plans: 'plans', subscription: 'plans',
      pool: 'pool', wallet: 'wallet', money: 'wallet', earth: 'global', global: 'global',
      help: 'help', radar: 'radar', offers: 'offers', tiles: 'offers',
      rest: 'rest', timeline: 'timeline', past: 'timeline',
    };
    for (var k in map) {
      if (new RegExp('\\b' + k + '\\b').test(low)) {
        return { ok: true, action: 'add', id: map[k], fromCatalog: true };
      }
    }

    var mNamed = t.match(
      /\b(?:button|shortcut)\s+(?:called|named|for)\s+["']?([\w-]{2,24})["']?(?:\s+that\s+(?:runs?|does|executes?)\s+(.+))?/i
    );
    if (mNamed) {
      return {
        ok: true,
        action: 'add',
        id: mNamed[1].toLowerCase(),
        label: mNamed[1],
        cmd: (mNamed[2] || mNamed[1]).trim(),
      };
    }

    var mFor = t.match(/\b(?:button|shortcut)\s+for\s+(.+)$/i);
    if (mFor) {
      var phrase = mFor[1].replace(/[.!?]+$/, '').trim();
      var id = phrase.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16);
      return { ok: true, action: 'add', id: id || 'btn', label: phrase.slice(0, 12), cmd: phrase };
    }

    return { ok: true, action: 'list' };
  }

  function applyNatural(raw) {
    var p = parseNatural(raw);
    if (!p) return null;
    if (p.action === 'list') {
      handleLine('button list');
      return { ok: true, detail: 'listed' };
    }
    if (p.action === 'remove') {
      dismiss(p.id);
      return { ok: true, detail: 'removed ' + p.id };
    }
    if (p.action === 'restore_all') {
      setHidden([]);
      paint();
      return { ok: true, detail: 'restored all' };
    }
    if (p.action === 'restore') {
      restore(p.id);
      return { ok: true, detail: 'restored ' + p.id };
    }
    if (p.action === 'add') {
      if (p.fromCatalog && CATALOG[p.id]) {
        restore(p.id);
        var order = getOrder();
        if (order.indexOf(p.id) < 0) {
          order.push(p.id);
          setOrder(order);
        }
        paint();
        log('Ribbon · catalog button · ' + p.id, 'ok');
        return { ok: true, detail: 'added ' + p.id };
      }
      return addButton({ id: p.id, label: p.label || p.id, cmd: p.cmd || p.id, emoji: p.emoji || '•' });
    }
    return null;
  }

  function handleLine(raw) {
    var line = String(raw || '').trim();
    var low = line.toLowerCase();
    if (!/^(button|btn|ribbon)\b/.test(low)) return false;

    var rest = line.replace(/^(button|btn|ribbon)\s*/i, '').trim();
    var rlow = rest.toLowerCase();

    if (!rest || rlow === 'list' || rlow === 'ls') {
      var ids = visibleIds();
      log('Ribbon · ' + ids.length + ' visible · swipe or arrows · hold+throw down to remove', 'ok');
      ids.forEach(function (id) {
        var d = resolveDef(id);
        log(' · ' + id + ' · ' + (d && d.label) + ' → ' + (d && d.cmd), 'dim');
      });
      var hid = getHidden();
      if (hid.length) log('Hidden · ' + hid.join(', ') + ' · restore: button restore <id>', 'dim');
      return true;
    }

    if (rlow === 'reset') {
      try {
        localStorage.removeItem(LS_LAYOUT);
        localStorage.removeItem(LS_CUSTOM);
        localStorage.removeItem(LS_HIDDEN);
      } catch (_) {}
      paint();
      log('Ribbon · factory defaults', 'ok');
      return true;
    }

    if (/^restore\s+all\b/i.test(rest)) {
      setHidden([]);
      paint();
      log('Ribbon · restored all', 'ok');
      return true;
    }

    var mRest = rest.match(/^restore\s+(\S+)/i);
    if (mRest) {
      restore(mRest[1]);
      return true;
    }

    var mRm = rest.match(/^(remove|throw|hide|delete)\s+(\S+)/i);
    if (mRm) {
      dismiss(mRm[2]);
      return true;
    }

    if (/^add\b/i.test(rest)) {
      var body = rest.replace(/^add\s*/i, '').trim();
      var kv = {};
      body.replace(/(\w+)=("([^"]*)"|'([^']*)'|(\S+))/g, function (_, k, _v, a, b, c) {
        kv[k.toLowerCase()] = a != null ? a : b != null ? b : c;
        return '';
      });
      if (kv.id || kv.label || kv.cmd) {
        addButton({
          id: kv.id || kv.label,
          label: kv.label || kv.id,
          emoji: kv.emoji || kv.icon || '•',
          cmd: kv.cmd || kv.command || kv.id,
          title: kv.title,
        });
        return true;
      }
      var parts = body.split(/\s+/).filter(Boolean);
      if (parts.length >= 1) {
        var id = parts[0];
        var label = parts[1] || parts[0];
        var cmd = parts.slice(2).join(' ') || parts[0];
        var emoji = '•';
        if (/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}⬠⏻◎⚓🎙🗺◈✦⇄🌍]$/u.test(parts[0])) {
          emoji = parts[0];
          id = parts[1] || 'btn';
          label = parts[2] || id;
          cmd = parts.slice(3).join(' ') || id;
        }
        addButton({ id: id, label: label, emoji: emoji, cmd: cmd });
        return true;
      }
      log('Usage · button add <id> <label> [cmd] · or button add id=x label=Y cmd=…', 'dim');
      return true;
    }

    log('Ribbon · button list | add | remove | restore | reset', 'dim');
    return true;
  }

  function installCli() {
    try {
      if (!global.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli._snRibbonHook) return;
      SNCli._snRibbonHook = true;
      var prev = SNCli.run.bind(SNCli);
      SNCli.run = function (raw) {
        try {
          if (handleLine(raw)) return Promise.resolve(true);
        } catch (_) {}
        return prev(raw);
      };
    } catch (_) {}
  }

  function init() {
    ensureCss();
    paint();
    installCli();
    var t = null;
    global.addEventListener(
      'resize',
      function () {
        if (t) clearTimeout(t);
        t = setTimeout(paint, 120);
      },
      { passive: true }
    );
  }

  global.SNRibbon = {
    init: init,
    paint: paint,
    add: addButton,
    addButton: addButton,
    dismiss: dismiss,
    restore: restore,
    handleLine: handleLine,
    parseNatural: parseNatural,
    applyNatural: applyNatural,
    list: visibleIds,
    catalog: function () {
      return Object.keys(CATALOG);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 80);
    });
  } else {
    setTimeout(init, 80);
  }
})(typeof window !== 'undefined' ? window : globalThis);
