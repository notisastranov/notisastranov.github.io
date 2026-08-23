/**
 * SNScrolls — four-edge scrolls + long-press layout edit
 * ========================================================
 * Top · Bottom · Left · Right
 * Collapsed always shows a grip of content (top: radar|name|money,
 * bottom: log line + input, sides: one button column).
 * Long-press 1s any .sn-gadget → resize/rearrange handles.
 * Layout persists sn:layout-v2
 */
(function (global) {
  'use strict';

  var LAYOUT_KEY = 'sn:layout-v2';
  var HOLD_MS = 1000;
  var edit = false;
  var holdT = null;
  var holdTarget = null;
  var dragState = null;

  function $(id) {
    return document.getElementById(id);
  }

  function loadLayout() {
    try {
      return JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function saveLayout(L) {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(L));
    } catch (_) {}
  }

  function ensureEdgeScrolls() {
    if ($('sn-leftscroll')) return;

    var left = document.createElement('div');
    left.id = 'sn-leftscroll';
    left.className = 'sn-edgescroll collapsed';
    left.setAttribute('aria-label', 'Left scroll · tools');
    left.innerHTML =
      '<div class="sn-edge-panel" id="sn-left-panel">' +
      '<div class="sn-edge-drag" data-edge="left" title="Left scroll · drag expand">' +
      '<span class="sn-edge-label">L</span></div>' +
      '<div class="sn-edge-rail sn-gadget-host" id="sn-left-rail" data-scroll="left"></div>' +
      '</div>';

    var right = document.createElement('div');
    right.id = 'sn-rightscroll';
    right.className = 'sn-edgescroll collapsed';
    right.setAttribute('aria-label', 'Right scroll · tools');
    right.innerHTML =
      '<div class="sn-edge-panel" id="sn-right-panel">' +
      '<div class="sn-edge-rail sn-gadget-host" id="sn-right-rail" data-scroll="right"></div>' +
      '<div class="sn-edge-drag" data-edge="right" title="Right scroll · drag expand">' +
      '<span class="sn-edge-label">R</span></div>' +
      '</div>';

    document.body.appendChild(left);
    document.body.appendChild(right);
  }

  /** Split tools: left = locate/user/layers · right = add/AI/send */
  /** Left/right rails stay EMPTY (thin grips only) until advanced graphics ready */
  function paintSideRails() {
    var left = $('sn-left-rail');
    var right = $('sn-right-rail');
    if (left) left.innerHTML = '';
    if (right) right.innerHTML = '';
    // Buttons live on BOTTOM scroll again
    try {
      var bar = $('sn-task-ribbon');
      if (bar) {
        bar.classList.remove('sn-rib-to-sides');
        bar.hidden = false;
        bar.removeAttribute('hidden');
        bar.setAttribute('aria-hidden', 'false');
      }
    } catch (_) {}
  }

  function bindEdgeDrag() {
    document.querySelectorAll('.sn-edge-drag').forEach(function (handle) {
      if (handle._bound) return;
      handle._bound = true;
      var edge = handle.getAttribute('data-edge');
      var root = edge === 'left' ? $('sn-leftscroll') : $('sn-rightscroll');
      if (!root) return;
      var startX = 0;
      var startW = 0;
      var dragging = false;
      var moved = false;

      function sizePx(mode) {
        var w = window.innerWidth || 360;
        if (mode === 'collapsed') return 18;
        if (mode === 'expanded') return Math.min(56, Math.round(w * 0.12));
        return Math.min(36, Math.round(w * 0.08));
      }

      function setMode(mode, freeW) {
        root.classList.remove('collapsed', 'mid', 'expanded');
        root.classList.add(mode);
        var px = freeW != null ? freeW : sizePx(mode);
        if (mode === 'collapsed') {
          root.style.width = sizePx('collapsed') + 'px';
        } else {
          root.style.width = px + 'px';
        }
        try {
          localStorage.setItem('sn:edge-' + edge + '-v1', mode);
        } catch (_) {}
      }

      try {
        var saved = localStorage.getItem('sn:edge-' + edge + '-v1');
        if (saved === 'mid' || saved === 'expanded' || saved === 'collapsed') setMode(saved);
        else setMode('collapsed');
      } catch (_) {
        setMode('collapsed');
      }

      handle.addEventListener('pointerdown', function (e) {
        if (e.button != null && e.button !== 0) return;
        startX = e.clientX;
        startW = root.getBoundingClientRect().width || sizePx('collapsed');
        dragging = true;
        moved = false;
        root.classList.add('dragging');
        try {
          handle.setPointerCapture(e.pointerId);
        } catch (_) {}
        e.preventDefault();
      });
      handle.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - startX;
        if (edge === 'right') dx = -dx;
        if (!moved && Math.abs(dx) < 6) return;
        moved = true;
        var next = Math.max(sizePx('collapsed'), Math.min(sizePx('expanded') + 40, startW + dx));
        root.style.width = next + 'px';
        root.classList.remove('collapsed', 'mid', 'expanded');
        if (next <= sizePx('collapsed') + 8) root.classList.add('collapsed');
        else if (next > sizePx('expanded') - 20) root.classList.add('expanded');
        else root.classList.add('mid');
      });
      function endDrag() {
        if (!dragging) return;
        dragging = false;
        root.classList.remove('dragging');
        var w = root.getBoundingClientRect().width;
        var pick = 'collapsed';
        if (w <= sizePx('collapsed') + 10) pick = 'collapsed';
        else if (w > sizePx('expanded') - 24) pick = 'expanded';
        else pick = 'mid';
        if (!moved) {
          // tap toggles
          if (root.classList.contains('collapsed')) pick = 'mid';
          else pick = 'collapsed';
        }
        setMode(pick);
      }
      handle.addEventListener('pointerup', endDrag);
      handle.addEventListener('pointercancel', endDrag);
    });
  }

  function markGadgets() {
    var pairs = [
      ['field-radar', 'radar'],
      ['field-balance-hud', 'money'],
      ['btn-home', 'name'],
      ['stc-perf-wrap', 'device'],
      ['cli-form', 'cli-input'],
      ['cli-log', 'cli-log'],
    ];
    pairs.forEach(function (p) {
      var el = $(p[0]);
      if (!el) return;
      el.classList.add('sn-gadget');
      el.setAttribute('data-gadget', p[1]);
    });
    // hosts
    var compact = $('stc-compact');
    if (compact) compact.classList.add('sn-gadget-host');
    var top = $('sn-topchrome-panel');
    if (top) top.setAttribute('data-scroll', 'top');
    var panel = $('panel');
    if (panel) panel.setAttribute('data-scroll', 'bottom');
  }

  function applySavedLayout() {
    var L = loadLayout();
    Object.keys(L).forEach(function (id) {
      var el = document.querySelector('[data-gadget="' + id + '"]');
      if (!el || !L[id]) return;
      var s = L[id];
      if (s.free) {
        el.classList.add('sn-gadget-free');
        el.style.position = 'fixed';
        el.style.left = s.x + 'px';
        el.style.top = s.y + 'px';
        el.style.width = (s.w || 80) + 'px';
        el.style.height = (s.h || 50) + 'px';
        el.style.zIndex = '90';
      } else {
        el.classList.remove('sn-gadget-free');
        if (s.w) el.style.width = s.w + 'px';
        if (s.h) el.style.height = s.h + 'px';
        if (s.scroll && s.scroll !== 'top' && s.scroll !== 'bottom') {
          var host =
            s.scroll === 'left'
              ? $('sn-left-rail')
              : s.scroll === 'right'
                ? $('sn-right-rail')
                : null;
          if (host && el.parentNode !== host) {
            try {
              host.appendChild(el);
            } catch (_) {}
          }
        }
      }
    });
  }

  function enterEdit(fromEl) {
    edit = true;
    document.body.classList.add('sn-layout-edit');
    document.querySelectorAll('.sn-gadget').forEach(function (g) {
      if (g.querySelector('.sn-g-handle')) return;
      var h = document.createElement('div');
      h.className = 'sn-g-handle';
      h.innerHTML =
        '<span class="sn-g-move" title="Drag">✦</span><span class="sn-g-resize" title="Resize"></span>';
      g.appendChild(h);
      wireGadgetHandles(g);
    });
    try {
      if (global.SNCli && SNCli.log)
        SNCli.log('Layout edit · drag ✦ · resize corner · long-press empty to exit', 'ok');
    } catch (_) {}
  }

  function exitEdit() {
    edit = false;
    document.body.classList.remove('sn-layout-edit');
    document.querySelectorAll('.sn-g-handle').forEach(function (h) {
      h.remove();
    });
    persistAll();
  }

  function persistAll() {
    var L = loadLayout();
    document.querySelectorAll('.sn-gadget[data-gadget]').forEach(function (g) {
      var id = g.getAttribute('data-gadget');
      if (!id) return;
      var r = g.getBoundingClientRect();
      var free = g.classList.contains('sn-gadget-free');
      var scroll = 'top';
      var host = g.closest('[data-scroll]');
      if (host) scroll = host.getAttribute('data-scroll') || 'top';
      L[id] = {
        free: free,
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        scroll: scroll,
      };
    });
    saveLayout(L);
  }

  function wireGadgetHandles(g) {
    var move = g.querySelector('.sn-g-move');
    var rez = g.querySelector('.sn-g-resize');
    if (move) {
      move.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        startDrag(g, e, 'move');
      });
    }
    if (rez) {
      rez.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        startDrag(g, e, 'resize');
      });
    }
  }

  function startDrag(g, e, mode) {
    var r = g.getBoundingClientRect();
    dragState = {
      el: g,
      mode: mode,
      ox: e.clientX,
      oy: e.clientY,
      left: r.left,
      top: r.top,
      w: r.width,
      h: r.height,
    };
    g.classList.add('sn-gadget-free', 'sn-dragging');
    g.style.position = 'fixed';
    g.style.left = r.left + 'px';
    g.style.top = r.top + 'px';
    g.style.width = r.width + 'px';
    g.style.height = r.height + 'px';
    g.style.zIndex = '200';
    try {
      g.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function onPointerMove(e) {
    if (!dragState) return;
    var d = dragState;
    var dx = e.clientX - d.ox;
    var dy = e.clientY - d.oy;
    if (d.mode === 'move') {
      d.el.style.left = d.left + dx + 'px';
      d.el.style.top = d.top + dy + 'px';
    } else {
      d.el.style.width = Math.max(40, d.w + dx) + 'px';
      d.el.style.height = Math.max(32, d.h + dy) + 'px';
    }
  }

  function onPointerUp(e) {
    if (!dragState) return;
    var g = dragState.el;
    g.classList.remove('sn-dragging');
    // Drop into scroll host if over one
    var hosts = document.querySelectorAll('.sn-gadget-host, [data-scroll]');
    var dropped = false;
    var cx = e.clientX;
    var cy = e.clientY;
    hosts.forEach(function (host) {
      if (dropped) return;
      var r = host.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
        // dock into host
        g.classList.remove('sn-gadget-free');
        g.style.position = '';
        g.style.left = '';
        g.style.top = '';
        g.style.zIndex = '';
        try {
          host.appendChild(g);
        } catch (_) {}
        dropped = true;
      }
    });
    // else stays free floating
    dragState = null;
    persistAll();
  }

  function bindLongPress() {
    var startX = 0;
    var startY = 0;
    document.addEventListener(
      'pointerdown',
      function (e) {
        if (e.button != null && e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        var g = e.target && e.target.closest && e.target.closest('.sn-gadget');
        if (!g) {
          if (edit) {
            holdT = setTimeout(function () {
              exitEdit();
            }, HOLD_MS);
          }
          return;
        }
        if (e.target.closest('.sn-g-handle')) return;
        holdTarget = g;
        holdT = setTimeout(function () {
          if (!edit) enterEdit(g);
          try {
            if (navigator.vibrate) navigator.vibrate(12);
          } catch (_) {}
        }, HOLD_MS);
      },
      true
    );
    document.addEventListener(
      'pointermove',
      function (e) {
        if (holdT && (Math.abs(e.clientX - startX) > 12 || Math.abs(e.clientY - startY) > 12)) {
          clearTimeout(holdT);
          holdT = null;
          holdTarget = null;
        }
        onPointerMove(e);
      },
      true
    );
    document.addEventListener(
      'pointerup',
      function (e) {
        if (holdT) {
          clearTimeout(holdT);
          holdT = null;
        }
        holdTarget = null;
        onPointerUp(e);
      },
      true
    );
    document.addEventListener(
      'pointercancel',
      function () {
        if (holdT) clearTimeout(holdT);
        holdT = null;
        holdTarget = null;
        dragState = null;
      },
      true
    );
  }

  function init() {
    if (init._done) return;
    init._done = true;
    ensureEdgeScrolls();
    markGadgets();
    paintSideRails();
    bindEdgeDrag();
    bindLongPress();
    applySavedLayout();
    // re-paint sides after field ribbon builds
    setTimeout(paintSideRails, 400);
    setTimeout(paintSideRails, 1200);
    setTimeout(markGadgets, 500);
  }

  global.SNScrolls = {
    init: init,
    paintSideRails: paintSideRails,
    enterEdit: enterEdit,
    exitEdit: exitEdit,
    persistAll: persistAll,
    get edit() {
      return edit;
    },
  };
})(window);
