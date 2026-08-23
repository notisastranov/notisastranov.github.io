/**
 * CLI gestures — HARD minimize that sticks
 * - Swipe handle DOWN → minimize
 * - Tap handle title (not buttons) → toggle
 * - Overscroll past bottom OR top of log → minimize
 * - User collapse locks against ensureCliVisible re-open spam
 */
(function CliGestures() {
  'use strict';
  var VER = '20260723353000';
  if (window.__CLI_GESTURES__?.version === VER) return;
  window.__CLI_GESTURES__ = { version: VER, ready: false };

  var KEEP_OPEN_TURNS = 1;
  var caseSeq = 0;
  /* Start minimized; stay minimized until user expands (tap/swipe/send) */
  window.__cliUserCollapsed = true;
  window.__cliCollapseAt = Date.now();
  window.__cliStartMinimized = true;

  function deck() { return document.getElementById('globe-deck'); }
  function logEl() { return document.getElementById('globe-deck-log'); }
  function bodyEl() { return document.getElementById('globe-deck-body'); }

  function inCli(t) {
    return !!(t && t.closest && t.closest('#globe-deck'));
  }
  function isBtn(t) {
    return !!(t && t.closest && t.closest('button, a, input, textarea, select, [contenteditable], #aci-cli-form'));
  }
  function isHandle(t) {
    return !!(t && t.closest && t.closest(
      '#globe-deck-header, #super-cli-bar, #cli-ribbon-status, #globe-deck-title, #globe-deck-preview'
    ));
  }

  function ensureCss() {
    if (document.getElementById('cli-gestures-css')) return;
    var s = document.createElement('style');
    s.id = 'cli-gestures-css';
    s.textContent = [
      '/* HARD collapse — body+log gone */',
      '#globe-deck.collapsed #globe-deck-body,',
      '#globe-deck.collapsed #globe-deck-log,',
      '#globe-deck.collapsed #globe-deck-stage{',
      '  display:none!important;height:0!important;min-height:0!important;max-height:0!important;',
      '  overflow:hidden!important;padding:0!important;margin:0!important;border:0!important;opacity:0!important;',
      '  pointer-events:none!important;visibility:hidden!important;',
      '}',
      '#globe-deck.collapsed{',
      '  max-height:none!important;min-height:0!important;',
      '}',
      '#globe-deck.collapsed #globe-deck-input-row{display:flex!important;}',
      '#globe-deck.collapsed #super-cli-bar,#globe-deck.collapsed #globe-deck-header{display:flex!important;}',
      '#globe-deck-header,#super-cli-bar,#cli-ribbon-status{touch-action:none!important;cursor:grab;user-select:none;}',
      '#globe-deck-log,#globe-deck-body{touch-action:pan-y!important;overscroll-behavior-y:contain!important;}',
      '#aci-hud{pointer-events:none!important;}',
      '#aci-hud #globe-deck{pointer-events:auto!important;}',
      '#globe-deck, #globe-deck *{pointer-events:auto;}',
      /* cases */
      '#globe-deck-log .deck-case{margin:6px 0;border-left:3px solid rgba(90,122,176,.45);border-radius:0 8px 8px 0;background:rgba(8,14,24,.55);overflow:hidden}',
      '#globe-deck-log .deck-case-head{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;margin:0;border:0;background:transparent;color:#5a6a7e;font:600 11.5px/1.3 ui-monospace,monospace;text-align:left;cursor:pointer}',
      '#globe-deck-log .deck-case-head .case-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#b8c4d4}',
      '#globe-deck-log .deck-case-head .case-meta{font-size:10px;color:#5a6a7e}',
      '#globe-deck-log .deck-case-body{display:none;padding:2px 8px 8px 10px}',
      '#globe-deck-log .deck-case.open .deck-case-body{display:block}',
      '#globe-deck-log .deck-case.open .case-mark::before{content:"▼ "}',
      '#globe-deck-log .deck-case:not(.open) .case-mark::before{content:"▶ "}',
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ── HARD collapse / expand ───────────────────────────────────── */
  function collapse(reason) {
    var d = deck();
    if (!d) return;
    window.__cliUserCollapsed = true;
    window.__cliCollapseAt = Date.now();
    try {
      if (window.GlobeDeck) {
        GlobeDeck._size = 'collapsed';
        GlobeDeck.expanded = false;
        GlobeDeck._userEngaged = false;
      }
      if (window.AciCli) AciCli.open = false;
    } catch (_) {}

    d.classList.add('collapsed');
    d.classList.remove('expanded', 'size-third', 'size-full', 'size-free', 'deck-resizing');
    d.style.maxHeight = '';
    d.style.minHeight = '';
    d.style.height = '';

    var body = bodyEl();
    var log = logEl();
    var stage = document.getElementById('globe-deck-stage');
    if (body) {
      body.style.display = 'none';
      body.style.height = '0';
      body.style.minHeight = '0';
      body.style.maxHeight = '0';
      body.style.overflow = 'hidden';
    }
    if (log) {
      log.style.display = 'none';
      log.style.minHeight = '0';
      log.style.maxHeight = '0';
    }
    if (stage) stage.style.display = 'none';

    try { GlobeDeck?.applySize?.(); } catch (_) {}
    // re-force after applySize (it may clear inline styles)
    d.classList.add('collapsed');
    d.classList.remove('expanded', 'size-third', 'size-full', 'size-free');
    if (body) body.style.display = 'none';
    if (log) log.style.display = 'none';

    try {
      var st = document.getElementById('cli-ribbon-status');
      if (st) { st.textContent = 'minimized'; st.className = 'ready'; }
    } catch (_) {}
  }

  function expand(reason) {
    var d = deck();
    if (!d) return;
    window.__cliUserCollapsed = false;
    window.__cliCollapseAt = 0;
    try {
      if (window.GlobeDeck) {
        GlobeDeck._size = 'third';
        GlobeDeck.expanded = true;
      }
      if (window.AciCli) AciCli.open = true;
    } catch (_) {}

    d.classList.remove('collapsed');
    d.classList.add('expanded', 'size-third');

    var body = bodyEl();
    var log = logEl();
    var stage = document.getElementById('globe-deck-stage');
    if (body) {
      body.style.display = 'flex';
      body.style.flexDirection = 'column';
      body.style.minHeight = '100px';
      body.style.maxHeight = '40vh';
      body.style.height = '';
      body.style.overflow = 'hidden';
    }
    if (log) {
      log.style.display = 'block';
      log.style.minHeight = '72px';
      log.style.maxHeight = '36vh';
      log.style.overflowY = 'auto';
      log.style.flex = '1';
    }
    if (stage) stage.style.display = '';

    try { GlobeDeck?.applySize?.(); } catch (_) {}
    d.classList.remove('collapsed');
    d.classList.add('expanded', 'size-third');
  }

  function toggle() {
    var d = deck();
    if (!d) return;
    if (d.classList.contains('collapsed') || !window.GlobeDeck?.expanded) expand('toggle');
    else collapse('toggle');
  }

  function isCollapseLocked() {
    // While user-collapsed (including boot default), never auto-reopen
    return !!window.__cliUserCollapsed;
  }

  window.__cliCollapse = collapse;
  window.__cliExpand = expand;
  window.__cliToggle = toggle;

  /* Block auto-reopen while user just minimized */
  function patchGlobeDeck() {
    var G = window.GlobeDeck;
    if (!G || G.__collapsePatched === VER) return;
    G.__collapsePatched = VER;

    var _ensure = G.ensureCliVisible && G.ensureCliVisible.bind(G);
    if (_ensure) {
      G.ensureCliVisible = function (kind) {
        // Only user command opens a minimized CLI
        if (isCollapseLocked()) {
          if (kind === 'cmd') {
            window.__cliUserCollapsed = false;
            return _ensure(kind);
          }
          return;
        }
        return _ensure(kind);
      };
    }

    var _expand = G.expand && G.expand.bind(G);
    if (_expand) {
      G.expand = function (title) {
        // Block boot/noise expands while minimized; allow force or user toggle
        if (isCollapseLocked() && title !== 'force' && title !== true) return;
        window.__cliUserCollapsed = false;
        return _expand.apply(this, arguments);
      };
    }

    var _log = G.log && G.log.bind(G);
    if (_log) {
      G.log = function (text, cls) {
        var kind = cls || 'out';
        // Quiet append while minimized — never expand for system noise
        if (isCollapseLocked() && kind !== 'cmd') {
          try {
            var out = this.logEl && this.logEl();
            if (!out) return;
            var row = document.createElement('div');
            row.className = 'deck-line deck-' + kind;
            row.textContent = String(text || '');
            out.appendChild(row);
            while (out.children.length > 48) out.removeChild(out.firstChild);
            return;
          } catch (_) { return; }
        }
        if (kind === 'cmd') window.__cliUserCollapsed = false;
        var r = _log(text, cls);
        try { compactOlderTurns(); } catch (_) {}
        return r;
      };
    }

    // Boot: force collapsed size
    try {
      G._size = 'collapsed';
      G.expanded = false;
      G.applySize && G.applySize();
    } catch (_) {}
  }

  /* ── Isolate from Earth ───────────────────────────────────────── */
  function isolateEvents() {
    var d = deck();
    if (!d || d._cliIsoBound === VER) return;
    d._cliIsoBound = VER;
    d.style.pointerEvents = 'auto';

    ['touchstart', 'touchmove', 'touchend', 'wheel', 'pointerdown'].forEach(function (ev) {
      d.addEventListener(ev, function (e) {
        e.stopPropagation();
      }, { capture: true, passive: true });
    });
    d.addEventListener('wheel', function (e) {
      e.stopPropagation();
    }, { capture: true, passive: true });
  }

  /* ── Handle: swipe DOWN = minimize · tap = toggle ─────────────── */
  function bindHandle() {
    var d = deck();
    if (!d) return;
    if (d._cliHandleBound === VER) return;
    d._cliHandleBound = VER;

    var mode = null;
    var sy = 0;
    var sh = 0;
    var moved = 0;
    var fingerDown = 0; // max finger travel down (clientY increase)

    function onDown(clientY, target) {
      if (isBtn(target) && !target.closest('#globe-deck-header, #cli-ribbon-status, #globe-deck-title, #globe-deck-preview')) {
        // allow Send/login etc — don't steal
        if (target.closest('#super-cli-edge-right, #aci-login')) return;
      }
      if (!isHandle(target)) return;
      mode = 'gesture';
      sy = clientY;
      sh = d.getBoundingClientRect().height;
      moved = 0;
      fingerDown = 0;
    }

    function onMove(clientY, e) {
      if (mode !== 'gesture') return;
      var dyUp = sy - clientY;   // + = finger up = grow
      var dyDown = clientY - sy; // + = finger down = shrink / minimize
      moved = Math.max(moved, Math.abs(clientY - sy));
      fingerDown = Math.max(fingerDown, dyDown);

      // Swipe down hard → minimize immediately
      if (dyDown > 36) {
        if (e && e.cancelable) e.preventDefault();
        mode = null;
        collapse('swipe-down');
        return;
      }

      // Drag resize (finger up grows, moderate down shrinks)
      if (moved < 10) return;
      if (e && e.cancelable) e.preventDefault();
      var nh = Math.min(
        Math.min(window.innerHeight * 0.92, window.innerHeight - 28),
        Math.max(88, sh + dyUp)
      );
      d.classList.remove('collapsed', 'size-third', 'size-full');
      d.classList.add('expanded', 'size-free', 'deck-resizing');
      d.style.maxHeight = nh + 'px';
      d.style.minHeight = nh + 'px';
      var body = bodyEl();
      var log = logEl();
      if (body) {
        body.style.display = 'flex';
        body.style.maxHeight = Math.max(40, nh - 100) + 'px';
      }
      if (log) {
        log.style.display = 'block';
        log.style.maxHeight = Math.max(40, nh - 120) + 'px';
      }
      window.__cliUserCollapsed = false;
      if (window.GlobeDeck) {
        GlobeDeck.expanded = nh > 120;
        GlobeDeck._size = nh < 120 ? 'collapsed' : 'free';
        GlobeDeck._freeHeight = nh;
      }
    }

    function onUp() {
      if (mode !== 'gesture') return;
      d.classList.remove('deck-resizing');
      if (moved < 12) {
        toggle();
      } else if (fingerDown > 28) {
        collapse('swipe-down-end');
      } else {
        var h = d.getBoundingClientRect().height;
        if (h < 140) collapse('short-height');
        else {
          try {
            localStorage.setItem('astranov-deck-height', String(Math.round(h)));
            if (window.GlobeDeck) {
              GlobeDeck._freeHeight = Math.round(h);
              GlobeDeck._size = 'free';
              GlobeDeck.expanded = true;
            }
            window.__cliUserCollapsed = false;
            d.classList.remove('collapsed');
            d.classList.add('expanded', 'size-free');
          } catch (_) {}
        }
      }
      mode = null;
      moved = 0;
      fingerDown = 0;
    }

    d.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      onDown(e.touches[0].clientY, e.target);
    }, { passive: true });

    d.addEventListener('touchmove', function (e) {
      if (mode !== 'gesture' || e.touches.length !== 1) return;
      onMove(e.touches[0].clientY, e);
    }, { passive: false });

    d.addEventListener('touchend', onUp, { passive: true });
    d.addEventListener('touchcancel', onUp, { passive: true });

    d.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      onDown(e.clientY, e.target);
    });
    window.addEventListener('mousemove', function (e) {
      if (mode === 'gesture') onMove(e.clientY, e);
    });
    window.addEventListener('mouseup', onUp);

    // Title / ribbon double-duty click toggle (desktop)
    ['globe-deck-header', 'globe-deck-title', 'globe-deck-preview', 'cli-ribbon-status'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el._cliTapBound === VER) return;
      el._cliTapBound = VER;
      el.addEventListener('click', function (e) {
        if (isBtn(e.target) && e.target.tagName === 'BUTTON') return;
        if (moved > 10) return;
        e.preventDefault();
        e.stopPropagation();
        toggle();
      });
    });
  }

  /* ── Log overscroll minimize ──────────────────────────────────── */
  function atTop(log) { return (log.scrollTop || 0) <= 2; }
  function atBottom(log) {
    var max = Math.max(0, (log.scrollHeight || 0) - (log.clientHeight || 0));
    if (max <= 6) return true; // short log = treat as end
    return (log.scrollTop || 0) >= max - 4;
  }

  function bindLogScroll() {
    var log = logEl();
    if (!log) return;
    if (log._cliScrollBound === VER) return;
    log._cliScrollBound = VER;
    log.style.touchAction = 'pan-y';
    log.style.overscrollBehaviorY = 'contain';
    log.style.overflowY = 'auto';
    log.style.webkitOverflowScrolling = 'touch';

    var sy = 0, st0 = 0, top0 = false, bot0 = false, pull = false, acc = 0;
    var THRESH = 32;

    log.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      sy = e.touches[0].clientY;
      st0 = log.scrollTop;
      top0 = atTop(log);
      bot0 = atBottom(log);
      pull = true;
      acc = 0;
    }, { passive: true });

    log.addEventListener('touchmove', function (e) {
      if (!pull || e.touches.length !== 1) return;
      var y = e.touches[0].clientY;
      var dy = y - sy; // + finger down
      acc = dy;

      // At top, pull down → minimize
      if (top0 && atTop(log) && dy > THRESH) {
        if (e.cancelable) e.preventDefault();
        pull = false;
        collapse('log-top');
        return;
      }
      // At bottom (scrolled all the way down), keep going → minimize
      // finger moves up → content would scroll further down
      if (bot0 && atBottom(log) && dy < -THRESH) {
        if (e.cancelable) e.preventDefault();
        pull = false;
        collapse('log-bottom');
        return;
      }
    }, { passive: false });

    log.addEventListener('touchend', function () {
      if (pull) {
        if (top0 && acc > THRESH + 6) collapse('log-top-end');
        else if (bot0 && acc < -(THRESH + 6)) collapse('log-bottom-end');
      }
      pull = false;
      acc = 0;
    }, { passive: true });

    var wAcc = 0, wDir = 0;
    log.addEventListener('wheel', function (e) {
      e.stopPropagation();
      if (e.deltaY < 0 && atTop(log)) {
        if (wDir !== -1) { wDir = -1; wAcc = 0; }
        wAcc += -e.deltaY;
        if (wAcc > 40) { wAcc = 0; collapse('wheel-top'); }
        return;
      }
      if (e.deltaY > 0 && atBottom(log)) {
        if (wDir !== 1) { wDir = 1; wAcc = 0; }
        wAcc += e.deltaY;
        if (wAcc > 40) { wAcc = 0; collapse('wheel-bottom'); }
        return;
      }
      wAcc = 0;
      wDir = 0;
    }, { passive: true });
  }

  /* ── Case compaction ──────────────────────────────────────────── */
  function compactOlderTurns() {
    var log = logEl();
    if (!log) return;
    var kids = Array.prototype.slice.call(log.children).filter(function (el) {
      return el.classList && (el.classList.contains('deck-line') || el.classList.contains('deck-turn-live'));
    });
    if (kids.length < 4) return;
    var turns = [];
    var cur = [];
    kids.forEach(function (el) {
      if (el.classList.contains('deck-cmd') && cur.length) {
        turns.push(cur);
        cur = [el];
      } else cur.push(el);
    });
    if (cur.length) turns.push(cur);
    var toFold = turns.slice(0, Math.max(0, turns.length - KEEP_OPEN_TURNS));
    toFold.forEach(function (turn) {
      if (!turn[0] || turn[0].closest('.deck-case')) return;
      caseSeq += 1;
      var caseEl = document.createElement('div');
      caseEl.className = 'deck-case';
      var head = document.createElement('button');
      head.type = 'button';
      head.className = 'deck-case-head';
      head.innerHTML = '<span class="case-mark"></span><span class="case-title"></span><span class="case-meta"></span>';
      head.querySelector('.case-title').textContent =
        (turn[0].textContent || 'case').replace(/^›\s*/, '').slice(0, 72);
      head.querySelector('.case-meta').textContent = turn.length + ' lines';
      var body = document.createElement('div');
      body.className = 'deck-case-body';
      log.insertBefore(caseEl, turn[0]);
      turn.forEach(function (n) { body.appendChild(n); });
      head.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        caseEl.classList.toggle('open');
      });
      caseEl.appendChild(head);
      caseEl.appendChild(body);
    });
  }

  function apply() {
    ensureCss();
    isolateEvents();
    patchGlobeDeck();
    bindHandle();
    bindLogScroll();
    window.__CLI_GESTURES__.ready = true;
  }

  // Once at start — avoid re-apply thrash (was freezing Firefox with layout+WebGL)
  apply();
  setTimeout(function () {
    apply();
    if (window.__cliUserCollapsed !== false) {
      window.__cliUserCollapsed = true;
      collapse('boot-default');
    }
  }, 400);
  setTimeout(function () {
    if (window.__cliUserCollapsed !== false) collapse('boot-late');
  }, 2000);
})();
