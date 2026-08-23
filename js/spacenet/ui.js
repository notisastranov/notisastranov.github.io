/* SpaceNet CLI — one-finger grab ANYWHERE: move + smooth expand/retract (SPECS) */
(function (global) {
  'use strict';

  var POS_KEY = 'sn:cli-pos-v1';
  var SIZE_KEY = 'sn:cli-size-v1';

  function $(id) {
    return document.getElementById(id);
  }

  function dismissCoach() {
    var el = $('coach');
    if (!el) return;
    el.hidden = true;
    el.style.display = 'none';
    el.style.pointerEvents = 'none';
    try {
      localStorage.setItem('sn:coach-v1', '1');
    } catch (_) {}
  }
  function showCoach() {
    /* SPECS: never full-screen wall on cold boot — Earth must be free immediately */
    dismissCoach();
    return;
    var el = $('coach');
    try {
      if (localStorage.getItem('sn:coach-v1')) {
        dismissCoach();
        return;
      }
    } catch (_) {
      dismissCoach();
      return;
    }
    if (!el) return;
    el.hidden = false;
    el.style.display = '';
    el.style.pointerEvents = 'auto';
    function ok() {
      dismissCoach();
      try {
        $('cli-in') && $('cli-in').focus();
      } catch (_) {}
    }
    var btn = $('coach-ok');
    if (btn && !btn._snCoachBound) {
      btn._snCoachBound = true;
      btn.addEventListener('click', function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        ok();
      });
    }
    // Backdrop click + Esc also dismiss so Earth trackball is never stuck
    if (!el._snCoachBound) {
      el._snCoachBound = true;
      el.addEventListener('click', function (e) {
        if (e.target === el) ok();
      });
      document.addEventListener(
        'keydown',
        function (e) {
          if (el.hidden) return;
          if (e.key === 'Escape' || e.key === 'Enter') {
            ok();
          }
        },
        true
      );
    }
    // Hard ceiling: never block the globe forever
    setTimeout(function () {
      if (el && !el.hidden) ok();
    }, 12000);
  }

  /** Default expand target: 1/3 viewport (button/AI — no drag needed) */
  function oppositeTopReserve() {
    // Collapsed top chrome + air gap so bottom never kisses the top scroll
    return 100;  // top collapsed ~62 + gap ~38
  }
  function recapTopForBottom(botPx) {
    try {
      var top = document.getElementById('sn-topchrome-panel');
      if (!top || top.classList.contains('collapsed')) return;
      var h = window.innerHeight || 700;
      var maxT = Math.max(54, h - botPx - 20);
      var th = top.getBoundingClientRect().height;
      if (th > maxT + 2) {
        top.style.setProperty('max-height', maxT + 'px', 'important');
        top.style.setProperty('height', maxT + 'px', 'important');
        var law = document.getElementById('sn-top-scroll-law');
        if (law)
          law.textContent =
            '#sn-topchrome-panel.mid,#sn-topchrome-panel.expanded{max-height:' +
            maxT +
            'px!important;height:' +
            maxT +
            'px!important}';
      }
    } catch (_) {}
  }

  /** Owner law: CLI + ribbon never more than 1/3 of screen height */
  function thirdCeilPx() {
    var h = window.innerHeight || 700;
    return Math.max(120, Math.floor(h / 3));
  }

  function defaultMaxCliPx() {
    return thirdCeilPx();
  }

  /** Absolute ceiling — 1/3 screen (ribbon + log + input included) */
  function dragMaxCliPx() {
    return thirdCeilPx();
  }

  function sizePx(mode) {
    var h = window.innerHeight || 700;
    var third = thirdCeilPx();
    // Collapsed: ribbon + one peek line + input only — stay compact when quiet
    if (mode === 'collapsed') return 72;
    // Mid: small useful log peek — not a wall of chrome
    if (mode === 'mid') return Math.min(third, Math.max(120, Math.round(h * 0.22)));
    // "Expanded" is still capped at 1/3 — never half-screen CLI
    return third;
  }

  function currentMode(panel) {
    if (panel.classList.contains('expanded')) return 'expanded';
    if (panel.classList.contains('collapsed')) return 'collapsed';
    return 'mid';
  }

  function setSize(mode, animate) {
    var panel = $('panel');
    if (!panel) return;
    panel.classList.remove('expanded', 'collapsed', 'mid');
    if (mode === 'collapsed') panel.classList.add('collapsed');
    else if (mode === 'expanded') panel.classList.add('expanded');
    else panel.classList.add('mid');
    var px = sizePx(mode === 'expanded' ? 'expanded' : mode === 'collapsed' ? 'collapsed' : 'mid');
    // Cap: never cover the top scroll
    var cap = dragMaxCliPx();
    if (px > cap) px = cap;
    var law = document.getElementById('sn-bot-scroll-law');
    if (!law) {
      law = document.createElement('style');
      law.id = 'sn-bot-scroll-law';
      document.head.appendChild(law);
    }
    if (mode === 'collapsed') {
      panel.style.removeProperty('max-height');
      panel.style.removeProperty('height');
      panel.style.removeProperty('min-height');
      panel.style.setProperty('height', 'auto', 'important');
      panel.style.setProperty('min-height', '0', 'important');
      panel.style.setProperty('max-height', 'none', 'important');
      law.textContent =
        '#panel.collapsed{height:auto!important;min-height:0!important;max-height:none!important;grid-template-rows:10px 44px 0 auto!important}';
    } else {
      panel.style.setProperty('max-height', px + 'px', 'important');
      panel.style.setProperty('height', 'auto', 'important');
      panel.style.setProperty('min-height', '0', 'important');
      law.textContent =
        'html body #dock #panel.mid,html body #dock #panel.expanded{max-height:' +
        px +
        'px !important;height:auto !important;min-height:0!important;}' +
        'html body #dock{top:auto !important;bottom:0 !important;justify-content:center !important;align-items:flex-end !important;}';
      try {
        document.head.appendChild(law);
      } catch (_) {}
      recapTopForBottom(px);
    }
    if (animate !== false) panel.classList.add('sn-size-anim');
    try {
      localStorage.setItem(SIZE_KEY, mode);
    } catch (_) {}
  }

  function expandPanel(on) {
    if (on === true) setSize('expanded');
    else if (on === false) setSize('collapsed');
    else {
      var p = $('panel');
      var m = p ? currentMode(p) : 'mid';
      if (m === 'expanded') setSize('mid');
      else if (m === 'collapsed') setSize('mid');
      else setSize('expanded');
    }
  }

  /** Put CLI back bottom-center; clear free drag scatter */
  function resetChrome() {
    var dock = $('dock');
    var panel = $('panel');
    if (!dock || !panel) return;
    pinDockBottom();
    dock.style.left = '';
    dock.style.top = '';
    dock.style.right = '';
    dock.style.bottom = '';
    dock.style.transform = '';
    dock.style.width = '';
    dock.style.padding = '';
    panel.style.margin = '';
    panel.style.maxWidth = '';
    panel.style.width = '';
    panel.style.maxHeight = '';
    panel.style.height = '';
    setSize('collapsed', false);
    try {
      global.SNTile?.close?.();
    } catch (_) {}
  }

  /** Scrolls stay edge-locked — never free-float on the map */
  function pinDockBottom() {
    var dock = $('dock');
    var panel = $('panel');
    if (!dock) return;
    try {
      localStorage.removeItem(POS_KEY);
    } catch (_) {}
    dock.classList.remove('free');
    // Force fixed bottom edge (beats any leftover free-drag inline styles)
    dock.style.setProperty('position', 'fixed', 'important');
    dock.style.setProperty('left', '0px', 'important');
    dock.style.setProperty('right', '0px', 'important');
    dock.style.setProperty('bottom', '0px', 'important');
    dock.style.setProperty('top', 'auto', 'important');
    dock.style.setProperty('transform', 'none', 'important');
    dock.style.setProperty('margin', '0px', 'important');
    dock.style.setProperty('width', '100%', 'important');
    dock.style.setProperty('justify-content', 'center', 'important');
    dock.style.setProperty('align-items', 'flex-end', 'important');
    dock.style.removeProperty('padding');
    if (panel) {
      panel.style.removeProperty('margin');
      panel.style.removeProperty('margin-left');
      panel.style.removeProperty('margin-right');
      panel.style.removeProperty('margin-top');
      panel.style.removeProperty('margin-bottom');
      panel.style.setProperty('position', 'relative', 'important');
      panel.style.setProperty('left', 'auto', 'important');
      panel.style.setProperty('top', 'auto', 'important');
      panel.style.setProperty('right', 'auto', 'important');
      panel.style.setProperty('bottom', 'auto', 'important');
      panel.style.setProperty('transform', 'none', 'important');
    }
  }

  function applyPos(dock, panel, left, top) {
    // DISABLED — bottom scroll stays docked at screen bottom
    pinDockBottom();
    return;

    var padTop = 56;
    var padSide = 8;
    var pw = panel.offsetWidth || Math.min(540, window.innerWidth - 16);
    var ph = panel.offsetHeight || 120;
    var maxL = Math.max(padSide, window.innerWidth - pw - padSide);
    var maxT = Math.max(padTop, window.innerHeight - Math.min(ph, window.innerHeight * 0.9) - 8);
    var l = Math.min(maxL, Math.max(padSide, left));
    var t = Math.min(maxT, Math.max(padTop, top));
    dock.classList.add('free');
    dock.style.left = l + 'px';
    dock.style.top = t + 'px';
    dock.style.right = 'auto';
    dock.style.bottom = 'auto';
    dock.style.transform = 'none';
    dock.style.width = 'auto';
    dock.style.padding = '0';
    panel.style.margin = '0';
    panel.style.maxWidth = Math.min(540, window.innerWidth - 16) + 'px';
    panel.style.width = Math.min(540, window.innerWidth - 16) + 'px';
    return { left: l, top: t };
  }

  function isInteractive(el) {
    if (!el || !el.closest) return false;
    var tag = (el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A')
      return true;
    if (el.isContentEditable) return true;
    if (el.closest('button, a, input, textarea, select, [role="button"]')) return true;
    return false;
  }

  /**
   * One finger grab from ANYWHERE on #panel:
   * - vertical dominate → live expand/retract (smooth px height) → snap collapsed|mid|expanded
   * - horizontal / free → move dock (persist)
   * - taps on buttons/input still work if finger barely moves
   */

  /** Keep scrolling past end of CLI log → retract whole bottom scroll */
  function bindCliOverscrollRetract() {
    var panel = $('panel');
    if (!panel || panel._snOverscrollBound) return;
    panel._snOverscrollBound = true;
    var accum = 0;
    var lastTY = null;
    var THRESH = 160; // need clear overscroll intent to retract
    function expanded() {
      return !panel.classList.contains('collapsed');
    }
    function scroller() {
      return $('cli-log') || panel;
    }
    function atEnd(el, dir) {
      if (!el) return true;
      var max = Math.max(0, el.scrollHeight - el.clientHeight);
      if (max < 4) return true;
      if (dir > 0) return el.scrollTop >= max - 2;
      return el.scrollTop <= 1;
    }
    function tick(dir, amount) {
      if (!expanded()) {
        accum = 0;
        return false;
      }
      // Only retract when mid/expanded (not tiny collapsed)
      var mode = currentMode(panel);
      if (mode === 'collapsed') {
        accum = 0;
        return false;
      }
      if (!atEnd(scroller(), dir)) {
        accum = 0;
        return false;
      }
      accum += Math.abs(amount || 0);
      // Only full collapse from expanded — mid stays mid (globe use must not kill CLI)
      if (accum >= THRESH) {
        accum = 0;
        var m = currentMode(panel);
        if (m === 'expanded') setSize('mid', true);
        else if (m === 'mid') setSize('collapsed', true);
        return true;
      }
      return true;
    }
    panel.addEventListener(
      'wheel',
      function (e) {
        if (!expanded()) return;
        var dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
        if (!dir) return;
        if (tick(dir, e.deltaY)) {
          if (e.cancelable) e.preventDefault();
        }
      },
      { passive: false }
    );
    panel.addEventListener(
      'touchstart',
      function (e) {
        if (!expanded() || !e.touches || !e.touches[0]) return;
        lastTY = e.touches[0].clientY;
        accum = 0;
      },
      { passive: true }
    );
    panel.addEventListener(
      'touchmove',
      function (e) {
        if (!expanded() || lastTY == null || !e.touches || !e.touches[0]) return;
        var y = e.touches[0].clientY;
        var dy = lastTY - y;
        lastTY = y;
        if (Math.abs(dy) < 1) return;
        var dir = dy > 0 ? 1 : -1;
        if (tick(dir, dy * 1.4) && atEnd(scroller(), dir)) {
          if (e.cancelable) e.preventDefault();
        }
      },
      { passive: false }
    );
    panel.addEventListener(
      'touchend',
      function () {
        lastTY = null;
        accum = Math.min(accum, THRESH * 0.4);
      },
      { passive: true }
    );
  }

  function bindCliDrag() {
    var dock = $('dock');
    var panel = $('panel');
    if (!dock || !panel || panel._snDragBound) return;
    panel._snDragBound = true;

    var startX = 0,
      startY = 0,
      origL = 0,
      origT = 0,
      startH = 0,
      dragging = false,
      moved = false,
      mode = 'none',
      ptrId = null,
      startedOnInteractive = false;

    try {
      pinDockBottom();
      // Quiet boot: always collapsed. Auto-fit grows only when useful lines arrive.
      setSize('collapsed', false);
      try {
        localStorage.setItem(SIZE_KEY, 'collapsed');
      } catch (_) {}
    } catch (_) {
      setSize('collapsed', false);
    }

    function onStart(e) {
      if (e.pointerType === 'touch' && e.isPrimary === false) return;
      if (e.button != null && e.button !== 0) return;
      var t = e;
      if (!t) return;
      startedOnInteractive = isInteractive(e.target);
      // Never steal clicks from 🎙 / send / inputs — capture breaks hands-free & buttons
      if (startedOnInteractive) {
        dragging = false;
        return;
      }
      // Resize from grip · ribbon · top strip · or log edge (one finger minimize)
      var tgt = e.target;
      // Never start drag from the input form / buttons
      if (tgt && tgt.closest('#cli-form, #cli-in, #stc-cmd, #stc-cmd-in, #btn-send, #btn-handsfree, button, a, input')) {
        dragging = false;
        return;
      }
      var prect = panel.getBoundingClientRect();
      var onGrip =
        tgt &&
        (tgt.closest('#cli-drag') ||
          tgt.closest('#sn-cli-grip') ||
          tgt.closest('#sn-task-ribbon') ||
          tgt.closest('.sn-panel-grip') ||
          tgt.id === 'cli-drag');
      var inTopStrip = t.clientY >= prect.top && t.clientY <= prect.top + 52;
      var onLog = tgt && tgt.closest && tgt.closest('#cli-log');
      // Log: allow start — onMove decides scroll vs resize
      if (!onGrip && !inTopStrip && !onLog && tgt.id !== 'panel') {
        dragging = false;
        return;
      }
      // stash log mode for move
      panel._snDragFromLog = !!onLog && !onGrip && !inTopStrip;
      var rect = dock.getBoundingClientRect();
      if (!dock.classList.contains('free')) {
        origL = rect.left;
        origT = rect.top;
      } else {
        origL = parseFloat(dock.style.left) || rect.left;
        origT = parseFloat(dock.style.top) || rect.top;
      }
      startX = t.clientX;
      startY = t.clientY;
      startH = panel.getBoundingClientRect().height || sizePx(currentMode(panel));
      dragging = true;
      moved = false;
      mode = 'none';
      ptrId = e.pointerId;
      try {
        panel.setPointerCapture(e.pointerId);
      } catch (_) {}
      panel.classList.add('dragging');
      panel.classList.remove('sn-size-anim');
    }

    function onMove(e) {
      if (!dragging) return;
      if (ptrId != null && e.pointerId !== ptrId) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      var dist = Math.abs(dx) + Math.abs(dy);
      // On interactive targets, require a clearer drag so taps still work
      var thresh = startedOnInteractive ? 14 : 6;
      if (!moved && dist < thresh) return;
      moved = true;
      // If started on log and log can scroll that way, prefer content scroll (don't resize yet)
      if (panel._snDragFromLog) {
        var logEl = $('cli-log');
        if (logEl) {
          var maxS = Math.max(0, logEl.scrollHeight - logEl.clientHeight);
          var canUp = logEl.scrollTop > 1; // finger down → content up needs scrollTop
          var canDown = logEl.scrollTop < maxS - 1;
          // dy > 0 finger down → expand panel (reduce height? bottom: startH - dy)
          // Finger up (dy < 0) → expand CLI; finger down (dy > 0) → minimize
          if (maxS > 8) {
            if (dy < 0 && canDown) {
              // scrolling content down — don't steal
              logEl.scrollTop = Math.min(maxS, logEl.scrollTop - dy);
              if (e.cancelable) e.preventDefault();
              return;
            }
            if (dy > 0 && canUp) {
              logEl.scrollTop = Math.max(0, logEl.scrollTop - dy);
              if (e.cancelable) e.preventDefault();
              return;
            }
            // at edge → fall through to resize
          }
        }
      }
      // Vertical only — expand/retract. Never drag dock off the bottom edge.
      mode = 'size';
      if (false) {
        applyPos(dock, panel, origL + dx, origT + dy);
      } else {
        // Drag free height · floor collapsed · ceiling keep gap to top scroll
        var next = Math.max(92, Math.min(dragMaxCliPx(), startH - dy));
        panel.style.setProperty('max-height', next + 'px', 'important');
        panel.style.setProperty('height', next + 'px', 'important');
        panel.classList.remove('expanded', 'collapsed', 'mid');
        if (next < sizePx('collapsed') + 16) panel.classList.add('collapsed');
        else if (next > dragMaxCliPx() * 0.82) panel.classList.add('expanded');
        else panel.classList.add('mid');
        try {
          var lawD = document.getElementById('sn-bot-scroll-law');
          if (!lawD) {
            lawD = document.createElement('style');
            lawD.id = 'sn-bot-scroll-law';
            document.head.appendChild(lawD);
          }
          lawD.textContent =
            '#panel.mid,#panel.expanded{max-height:' +
            next +
            'px!important;height:' +
            next +
            'px!important}';
        } catch (_) {}
      }
      if (e.cancelable) e.preventDefault();
    }

    function onEnd(e) {
      if (!dragging) return;
      if (ptrId != null && e.pointerId !== ptrId && e.type !== 'pointercancel') return;
      dragging = false;
      panel.classList.remove('dragging');
      try {
        if (ptrId != null) panel.releasePointerCapture(ptrId);
      } catch (_) {}
      ptrId = null;
      if (!moved) {
        // pure tap — leave input/buttons alone
        mode = 'none';
        return;
      }
      if (mode === 'move') {
        pinDockBottom();
      } else if (mode === 'size') {
        // Keep user-dragged height — do NOT snap back to 1/3 if they overrode
        var h = panel.getBoundingClientRect().height || startH;
        var c = sizePx('collapsed');
        var def = defaultMaxCliPx();
        var pick = 'mid';
        if (h < (c + sizePx('mid')) / 2) pick = 'collapsed';
        else if (h >= def - 12) pick = 'expanded';
        panel.classList.remove('expanded', 'collapsed', 'mid');
        panel.classList.add(pick);
        // Preserve free height when user dragged past default max
        // Hard cap 1/3 even if user dragged hard
        var fh = Math.min(thirdCeilPx(), Math.round(h));
        if (pick === 'collapsed') setSize('collapsed', true);
        else {
          panel.style.setProperty('max-height', fh + 'px', 'important');
          panel.style.setProperty('height', fh + 'px', 'important');
          panel.classList.remove('expanded', 'collapsed', 'mid');
          panel.classList.add(fh >= thirdCeilPx() - 4 ? 'expanded' : 'mid');
        }
        try {
          localStorage.setItem(SIZE_KEY, pick);
        } catch (_) {}
      }
      mode = 'none';
    }

    // Whole panel is the grab surface
    panel.addEventListener('pointerdown', onStart, { passive: true });
    panel.addEventListener('pointermove', onMove, { passive: false });
    panel.addEventListener('pointerup', onEnd, { passive: true });
    panel.addEventListener('pointercancel', onEnd, { passive: true });
    // Also track on window so finger leaving panel still ends cleanly
    window.addEventListener('pointerup', onEnd, { passive: true });
    window.addEventListener('pointercancel', onEnd, { passive: true });

    window.addEventListener(
      'resize',
      function () {
        pinDockBottom();
      },
      { passive: true }
    );
    // Keep pinned if anything re-adds free class
    try {
      var mo = new MutationObserver(function () {
        if (dock.classList.contains('free')) pinDockBottom();
      });
      mo.observe(dock, { attributes: true, attributeFilter: ['class', 'style'] });
    } catch (_) {}
    setInterval(pinDockBottom, (window.SNPerf&&SNPerf.lean)?8000:2000);
  }

  function init() {
    try {
      if (localStorage.getItem('sn:coach-v1')) dismissCoach();
    } catch (_) {}

    if (init._done) return;
    init._done = true;
    // Focus expands mid so field is usable, without fighting grab
    $('cli-in') &&
      $('cli-in').addEventListener('focus', function () {
        /* stay collapsed until there is a real log */
      });
    $('btn-expand') &&
      $('btn-expand').addEventListener('click', function () {
        expandPanel();
      });
    pinDockBottom();
    bindCliDrag();
    bindCliOverscrollRetract();
    setTimeout(function(){ dismissCoach(); }, 0);
    setTimeout(dismissCoach, 400);
    setTimeout(dismissCoach, 1200);
    var badge = $('perf-badge');
    if (badge) {
      badge.textContent = 'AS';
      badge.title = 'Astranov SpaceNet';
    }
  }

  global.SNUi = {
    init: init,
    showCoach: showCoach,
    dismissCoach: dismissCoach,
    expandPanel: expandPanel,
    setCliSize: setSize,
    /** Grow/shrink CLI from useful log lines only — never > 1/3, collapse if empty */
    fitCliToContent: function (lineCount) {
      var n = Number(lineCount) || 0;
      var panel = $('panel');
      if (!panel) return;
      if (n <= 0) {
        setSize('collapsed', true);
        return;
      }
      // 1–2 useful lines → mid peek; more still capped at 1/3
      if (n <= 3) setSize('mid', true);
      else setSize('expanded', true); // still ≤ 1/3 via sizePx
    },
    bindCliDrag: bindCliDrag,
    pinDockBottom: pinDockBottom,
    bindCliOverscrollRetract: bindCliOverscrollRetract,
    setSize: setSize,
    resetChrome: resetChrome,
  };
})(window);
