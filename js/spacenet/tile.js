/* SpaceNet unified multi-role tile — cover · avatar · roles · menu · dating · driver
 * One surface for social / dating / vendor order / driver profiles (map + CLI).
 */
(function (global) {
  'use strict';

  const T = {
    open: false,
    profileId: null,
    tab: 'about', // about | menu | dating | drive | social | cart | task
    /** peek = small basics (map stays usable) · full = order / edit */
    sizeMode: 'peek',
    /** Visual scale of card (pinch / wheel) — 0.55–1.35 */
    scale: 0.72,
    /** Free position on screen (px) — middle by default */
    left: null,
    top: null,
    w: null,
    h: null,
    /** SNTaskBoard enrich payload when showing a delivery task multi-tile */
    taskBoard: null,
    lastCardTap: 0,
    dragging: false,
    resizing: false,
  };
  const SIZE_KEY = 'sn:tile-scale-v2';
  const GEOM_KEY = 'sn:tile-geom-v2';
  /** Peek defaults — never dominate the map (≤ ~28% viewport) */
  const PEEK_W = 260;
  const PEEK_H = 220;
  const FULL_W = 340;
  const FULL_H = 420;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function maxPeekW() {
    return Math.min(PEEK_W, Math.round(window.innerWidth * 0.33));
  }
  function maxPeekH() {
    return Math.min(PEEK_H, Math.round(window.innerHeight * 0.28));
  }
  function maxFullW() {
    return Math.min(FULL_W, Math.round(window.innerWidth * 0.42));
  }
  function maxFullH() {
    return Math.min(FULL_H, Math.round(window.innerHeight * 0.55));
  }

  function loadScale() {
    try {
      const n = parseFloat(localStorage.getItem(SIZE_KEY) || '');
      if (n >= 0.55 && n <= 1.35) T.scale = n;
    } catch (_) {}
    // Do not restore huge legacy geom — peek is always the open default
    try {
      localStorage.removeItem('sn:tile-geom-v1');
      localStorage.removeItem('sn:tile-scale-v1');
    } catch (_) {}
  }

  function saveScale() {
    try {
      localStorage.setItem(SIZE_KEY, String(T.scale));
    } catch (_) {}
    try {
      localStorage.setItem(
        GEOM_KEY,
        JSON.stringify({
          left: T.left,
          top: T.top,
          w: T.w,
          h: T.h,
          sizeMode: T.sizeMode,
        })
      );
    } catch (_) {}
  }

  function applyScale() {
    const card = document.querySelector('#sn-tile .sn-tile-card');
    const root = $('sn-tile');
    if (!card) return;
    const peek = T.sizeMode !== 'full';
    if (root) {
      root.classList.toggle('sn-tile-peek', peek);
      root.classList.toggle('sn-tile-full', !peek);
    }
    const capW = peek ? maxPeekW() : maxFullW();
    const capH = peek ? maxPeekH() : maxFullH();
    const s = Math.max(0.55, Math.min(1.35, T.scale || 0.72));
    T.scale = s;
    let baseW = T.w != null ? T.w : peek ? PEEK_W : Math.round(FULL_W * s);
    let baseH = T.h != null ? T.h : peek ? PEEK_H : Math.round(FULL_H * s);
    // Hard caps so tile never eats the map
    const maxW = Math.min(baseW, capW, window.innerWidth - 24);
    const maxH = Math.min(baseH, capH, window.innerHeight - 24);
    T.w = maxW;
    T.h = maxH;
    card.style.width = maxW + 'px';
    card.style.height = maxH + 'px';
    card.style.maxWidth = Math.round(window.innerWidth * 0.42) + 'px';
    card.style.maxHeight = Math.round(window.innerHeight * 0.55) + 'px';
    card.style.minWidth = peek ? '200px' : '240px';
    card.style.minHeight = peek ? '160px' : '280px';
    card.style.transform = 'none';
    // Peek: lower-right above CLI · full: center if never placed
    if (T.left == null || T.top == null) {
      if (peek) {
        T.left = Math.max(8, window.innerWidth - maxW - 12);
        T.top = Math.max(8, window.innerHeight - maxH - 120);
      } else {
        T.left = Math.max(12, Math.round((window.innerWidth - maxW) / 2));
        T.top = Math.max(12, Math.round((window.innerHeight - maxH) / 2));
      }
    }
    T.left = Math.max(0, Math.min(T.left, window.innerWidth - 64));
    T.top = Math.max(0, Math.min(T.top, window.innerHeight - 64));
    card.style.left = T.left + 'px';
    card.style.top = T.top + 'px';
    const minus = $('sn-tile-smaller');
    const plus = $('sn-tile-bigger');
    if (minus) {
      minus.disabled = maxW <= 200;
      minus.setAttribute('aria-disabled', minus.disabled ? 'true' : 'false');
    }
    if (plus) {
      plus.disabled = maxW >= maxFullW();
      plus.setAttribute('aria-disabled', plus.disabled ? 'true' : 'false');
    }
  }

  /** Click + / − to resize (also pinch / wheel). Growing past peek flips to full. */
  function stepScale(dir) {
    const step = 36;
    const card = document.querySelector('#sn-tile .sn-tile-card');
    const curW = T.w != null ? T.w : (card && card.offsetWidth) || PEEK_W;
    const curH = T.h != null ? T.h : (card && card.offsetHeight) || PEEK_H;
    T.w = Math.max(200, Math.min(maxFullW() + 40, curW + (dir < 0 ? -step : step)));
    T.h = Math.max(160, Math.min(maxFullH() + 40, curH + (dir < 0 ? -step : step)));
    if (dir > 0 && (T.w > maxPeekW() + 20 || T.h > maxPeekH() + 20)) {
      T.sizeMode = 'full';
    }
    if (dir < 0 && T.w <= maxPeekW() && T.h <= maxPeekH()) {
      T.sizeMode = 'peek';
    }
    applyScale();
    saveScale();
    if (T.sizeMode === 'full') render();
  }

  function expandToFull() {
    if (T.sizeMode === 'full') return;
    T.sizeMode = 'full';
    T.w = maxFullW();
    T.h = maxFullH();
    T.left = Math.max(12, Math.round((window.innerWidth - T.w) / 2));
    T.top = Math.max(12, Math.round((window.innerHeight - T.h) / 2));
    applyScale();
    saveScale();
    render();
  }

  function collapseToPeek() {
    T.sizeMode = 'peek';
    T.w = maxPeekW();
    T.h = maxPeekH();
    T.left = Math.max(8, window.innerWidth - T.w - 12);
    T.top = Math.max(8, window.innerHeight - T.h - 120);
    applyScale();
    saveScale();
    render();
  }

  function bindSizeButtons() {
    const minus = $('sn-tile-smaller');
    const plus = $('sn-tile-bigger');
    const xBtn = $('sn-tile-close-grip') || $('sn-tile-close');
    if (minus && !minus._snBound) {
      minus._snBound = true;
      minus.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        stepScale(-1);
      });
    }
    if (plus && !plus._snBound) {
      plus._snBound = true;
      plus.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        stepScale(1);
      });
    }
    if (xBtn && !xBtn._snBound) {
      xBtn._snBound = true;
      xBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
      });
    }
  }

  function gripHtml() {
    return (
      '<div class="sn-tile-grip" id="sn-tile-grip" title="Drag empty space to move · − yellow · X red close · + green">' +
      '<button type="button" class="sn-tile-size-btn sn-tile-btn-minus" id="sn-tile-smaller" aria-label="Make tile smaller" title="Smaller">−</button>' +
      '<button type="button" class="sn-tile-size-btn sn-tile-btn-close" id="sn-tile-close-grip" aria-label="Close tile" title="Close">×</button>' +
      '<button type="button" class="sn-tile-size-btn sn-tile-btn-plus" id="sn-tile-bigger" aria-label="Make tile larger" title="Larger">+</button>' +
      '</div>'
    );
  }

  /**
   * One-finger (or mouse) drag to move tile + corner resize.
   * Drag from top grip or cover. Resize from bottom-right handle.
   */
  function bindDragAndResize(root) {
    if (!root || root._snDragBound) return;
    root._snDragBound = true;
    const card = root.querySelector('.sn-tile-card');
    if (!card) return;
    // Ensure resize handle exists
    if (!$('sn-tile-resize')) {
      const rh = document.createElement('button');
      rh.type = 'button';
      rh.className = 'sn-tile-resize';
      rh.id = 'sn-tile-resize';
      rh.setAttribute('aria-label', 'Resize tile');
      rh.title = 'Drag to resize';
      card.appendChild(rh);
    }

    let mode = null; // 'drag' | 'resize'
    let startX = 0;
    let startY = 0;
    let origL = 0;
    let origT = 0;
    let origW = 0;
    let origH = 0;
    let moved = false;

    function point(e) {
      if (e.touches && e.touches.length) return e.touches[0];
      if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0];
      return e;
    }

    function syncGeomFromCard() {
      const r = card.getBoundingClientRect();
      if (T.left == null || T.top == null) {
        T.left = Math.round(r.left);
        T.top = Math.round(r.top);
      }
      if (T.w == null) T.w = Math.round(r.width);
      if (T.h == null) T.h = Math.round(r.height);
      card.style.left = T.left + 'px';
      card.style.top = T.top + 'px';
      card.style.transform = 'none';
    }

    function onDown(e) {
      if (!T.open) return;
      // One finger only
      if (e.touches && e.touches.length > 1) return;
      const t = e.target;
      if (!t || !card.contains(t)) return;
      // Don't steal clicks from interactive controls / body scroll
      if (
        t.closest(
          '.sn-tile-size-btn, .sn-tile-btn-close, .sn-tile-x, .sn-tile-edit-cover, .sn-tile-edit-av, .sn-tile-body, .sn-tile-foot, .sn-tile-roles, .sn-tile-tabs, .sn-role, .sn-tab, a, input, select, textarea, label, .sn-btn, .sn-add'
        )
      ) {
        // Grip label/empty grip area is OK — size buttons excluded above
        if (!t.closest('.sn-tile-grip') || t.closest('button')) return;
      }
      const isResize = !!t.closest('.sn-tile-resize');
      const isDragZone = !!(
        t.closest('.sn-tile-grip') ||
        t.closest('.sn-tile-cover') ||
        t.closest('.sn-tile-head') ||
        isResize
      );
      if (!isDragZone && !isResize) return;

      syncGeomFromCard();
      const pt = point(e);
      mode = isResize ? 'resize' : 'drag';
      T.dragging = mode === 'drag';
      T.resizing = mode === 'resize';
      moved = false;
      startX = pt.clientX;
      startY = pt.clientY;
      origL = T.left;
      origT = T.top;
      origW = T.w != null ? T.w : card.offsetWidth;
      origH = T.h != null ? T.h : card.offsetHeight;
      card.classList.add(mode === 'drag' ? 'sn-dragging' : 'sn-resizing');
      try {
        if (e.cancelable) e.preventDefault();
      } catch (_) {}
      e.stopPropagation();
    }

    function onMove(e) {
      if (!mode) return;
      if (e.touches && e.touches.length > 1) {
        mode = null;
        return;
      }
      const pt = point(e);
      const dx = pt.clientX - startX;
      const dy = pt.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (mode === 'drag') {
        T.left = Math.max(0, Math.min(window.innerWidth - 64, origL + dx));
        T.top = Math.max(0, Math.min(window.innerHeight - 64, origT + dy));
        card.style.left = T.left + 'px';
        card.style.top = T.top + 'px';
      } else if (mode === 'resize') {
        T.w = Math.max(280, Math.min(window.innerWidth - 16, origW + dx));
        T.h = Math.max(280, Math.min(window.innerHeight - 16, origH + dy));
        card.style.width = T.w + 'px';
        card.style.height = T.h + 'px';
      }
      try {
        if (e.cancelable) e.preventDefault();
      } catch (_) {}
    }

    function onUp(e) {
      if (!mode) return;
      card.classList.remove('sn-dragging', 'sn-resizing');
      if (moved) {
        saveScale();
        // Prevent the click that follows a drag from closing the tile
        T.lastCardTap = 0;
        try {
          if (e && e.preventDefault) e.preventDefault();
        } catch (_) {}
      }
      mode = null;
      T.dragging = false;
      T.resizing = false;
    }

    // Pointer events cover mouse + one finger when available
    const usePointer = typeof window.PointerEvent === 'function';
    if (usePointer) {
      card.addEventListener('pointerdown', onDown, { passive: false });
      window.addEventListener(
        'pointermove',
        (e) => {
          if (mode) onMove(e);
        },
        { passive: false }
      );
      window.addEventListener('pointerup', onUp, { passive: false });
      window.addEventListener('pointercancel', onUp, { passive: false });
    } else {
      card.addEventListener('mousedown', onDown, { passive: false });
      card.addEventListener('touchstart', onDown, { passive: false });
      window.addEventListener('mousemove', onMove, { passive: false });
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('mouseup', onUp, { passive: false });
      window.addEventListener('touchend', onUp, { passive: false });
      window.addEventListener('touchcancel', onUp, { passive: false });
    }
  }

  /** Upgrade old grip bar if tile already in DOM without +/− */
  function ensureGripControls() {
    const grip = $('sn-tile-grip');
    if (!grip) return;
    // Force top-row layout: yellow − · red X · green +
    if (
      $('sn-tile-smaller') &&
      $('sn-tile-bigger') &&
      $('sn-tile-close-grip') &&
      grip.querySelector('.sn-tile-btn-minus')
    ) {
      bindSizeButtons();
      return;
    }
    grip.outerHTML = gripHtml();
    bindSizeButtons();
  }

  function ensureCss() {
    [
      'sn-tile-css',
      'sn-tile-css-v2',
      'sn-tile-css-v3',
      'sn-tile-css-v4',
      'sn-tile-css-v5',
      'sn-tile-css-v6',
      'sn-tile-css-v7',
      'sn-tile-css-v8',
      'sn-tile-css-v9',
    ].forEach((id) => {
      const old = document.getElementById(id);
      if (old) old.remove();
    });
    if (document.getElementById('sn-tile-css-v10')) return;
    const st = document.createElement('style');
    st.id = 'sn-tile-css-v10';
    st.textContent = [
      /* Peek: map stays clickable under transparent root · card only captures events */
      '#sn-tile{position:fixed;inset:0;z-index:130;display:none;pointer-events:none;',
      'background:transparent;touch-action:none}',
      '#sn-tile.open{display:block}',
      '#sn-tile.sn-tile-full{background:rgba(0,4,12,.28);pointer-events:auto}',
      '#sn-tile .sn-tile-card{',
      'position:absolute;pointer-events:auto;',
      'width:min(260px,33vw);height:min(220px,28vh);',
      'overflow:hidden;border-radius:14px;',
      'background:rgba(0,8,20,.97);border:1px solid rgba(61,158,255,.55);',
      'box-shadow:0 12px 32px rgba(0,0,0,.7),0 0 20px rgba(26,111,212,.25);',
      'color:#c8e4ff;display:flex;flex-direction:column;',
      'touch-action:none;-webkit-touch-callout:none;',
      'min-width:200px;min-height:160px;max-width:42vw;max-height:55vh}',
      '#sn-tile.sn-tile-peek .sn-tile-cover{height:48px!important}',
      '#sn-tile.sn-tile-peek .sn-tile-av{width:40px!important;height:40px!important}',
      '#sn-tile.sn-tile-peek .sn-tile-roles,#sn-tile.sn-tile-peek .sn-tile-tabs{display:none!important}',
      '#sn-tile.sn-tile-peek .sn-tile-body{font-size:11px;padding:4px 10px 6px!important;overflow:hidden}',
      '#sn-tile.sn-tile-peek .sn-photo-row{display:none!important}',
      '#sn-tile.sn-tile-peek .sn-tile-grip{min-height:40px;padding:6px 10px}',
      '#sn-tile .sn-tile-grip{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;',
      'gap:10px;padding:10px 12px 8px;font:11px system-ui;color:#7ab0d8;user-select:none;',
      'cursor:grab;touch-action:none;-webkit-user-select:none;',
      'background:linear-gradient(180deg,rgba(26,111,212,.22),transparent);',
      'border-bottom:1px solid rgba(26,111,212,.25);min-height:44px}',
      '#sn-tile .sn-tile-grip:active,#sn-tile .sn-tile-card.sn-dragging .sn-tile-grip{cursor:grabbing}',
      '#sn-tile .sn-tile-card.sn-dragging{opacity:.96;box-shadow:0 20px 56px rgba(0,0,0,.85),0 0 40px rgba(61,158,255,.4)!important}',
      '#sn-tile .sn-tile-size-btn{flex-shrink:0;width:22px;height:22px;border-radius:50%;',
      'border:1px solid transparent;color:#fff;font:800 13px/1 system-ui,sans-serif;',
      'cursor:pointer;padding:0;touch-action:manipulation;display:flex;align-items:center;justify-content:center}',
      '#sn-tile .sn-tile-size-btn:active{transform:scale(0.92)}',
      '#sn-tile .sn-tile-size-btn:disabled{opacity:.35;cursor:default;box-shadow:none}',
      /* Yellow − · Red X · Green +  — traffic-light rounds */
      '#sn-tile .sn-tile-btn-minus{',
      'background:radial-gradient(circle at 35% 30%,#ffe58a,#e0b000 70%);border-color:#c9a000;',
      'color:#3a2c00;box-shadow:0 0 10px rgba(255,200,60,.5)}',
      '#sn-tile .sn-tile-btn-minus:hover{filter:brightness(1.08)}',
      '#sn-tile .sn-tile-btn-close{',
      'background:radial-gradient(circle at 35% 30%,#ff8a8a,#c62828 70%);border-color:#ff4444;',
      'color:#fff;font-size:14px;box-shadow:0 0 10px rgba(255,60,60,.5)}',
      '#sn-tile .sn-tile-btn-close:hover{filter:brightness(1.1)}',
      '#sn-tile .sn-tile-btn-plus{',
      'background:radial-gradient(circle at 35% 30%,#8dffb4,#1a9e4a 70%);border-color:#2ecc71;',
      'color:#041a0c;box-shadow:0 0 10px rgba(46,204,113,.45)}',
      '#sn-tile .sn-tile-btn-plus:hover{filter:brightness(1.08)}',
      '#sn-tile .sn-tile-resize{position:absolute;right:2px;bottom:2px;width:22px;height:22px;',
      'cursor:nwse-resize;border:0;background:transparent;padding:0;z-index:5}',
      '#sn-tile .sn-tile-resize::after{content:"";display:block;width:12px;height:12px;margin:6px 0 0 6px;',
      'border-right:2px solid #3d9eff;border-bottom:2px solid #3d9eff;opacity:.85;',
      'box-shadow:2px 2px 0 rgba(61,158,255,.35)}',
      '#sn-tile .sn-tile-cover{position:relative;height:96px;background:#061428 center/cover no-repeat;flex-shrink:0;',
      'cursor:pointer}',
      /* Cover X hidden — close lives in top row (red) */
      '#sn-tile .sn-tile-x{display:none!important}',
      '#sn-tile .sn-tile-edit-cover{position:absolute;top:8px;right:8px;border:0;border-radius:10px;',
      'background:rgba(0,0,0,.55);color:#fff;width:34px;height:34px;cursor:pointer;font-size:16px;z-index:2}',
      '#sn-tile .sn-tile-head{display:flex;gap:12px;padding:0 14px 10px;margin-top:-28px;align-items:flex-end}',
      '#sn-tile .sn-tile-av-wrap{position:relative;flex-shrink:0;cursor:pointer}',
      '#sn-tile .sn-tile-av{width:64px;height:64px;border-radius:50%;border:3px solid #1a6fd4;object-fit:cover;',
      'background:#0a1a30;box-shadow:0 0 16px rgba(26,111,212,.4)}',
      '#sn-tile .sn-tile-edit-av{position:absolute;right:-2px;bottom:-2px;width:24px;height:24px;border-radius:50%;',
      'border:0;background:#1a6fd4;color:#fff;cursor:pointer;font-weight:700;font-size:13px;',
      'box-shadow:0 0 10px rgba(26,111,212,.5)}',
      '#sn-tile .sn-tile-name{font:700 16px system-ui;color:#e8f4ff;outline:none;border-radius:6px;padding:1px 4px;margin:-1px -4px}',
      '#sn-tile .sn-tile-handle{font:12px ui-monospace,monospace;color:#5a8aaa;outline:none;border-radius:6px;padding:1px 4px}',
      '#sn-tile .sn-tile-bio{font:12px system-ui;color:#8a9bb0;margin-top:4px;max-height:4.5em;overflow:auto;',
      'outline:none;border-radius:6px;padding:2px 4px;white-space:pre-wrap}',
      '#sn-tile .sn-tile-editable{cursor:text}',
      '#sn-tile .sn-tile-editable:hover{background:rgba(26,111,212,.15);box-shadow:0 0 0 1px rgba(61,158,255,.35)}',
      '#sn-tile .sn-tile-editable:focus{background:rgba(26,111,212,.22);box-shadow:0 0 0 2px rgba(61,158,255,.55);color:#fff}',
      '#sn-tile.owner-me .sn-tile-card{border-color:rgba(61,158,255,.75);',
      'box-shadow:0 16px 48px rgba(0,0,0,.75),0 0 40px rgba(61,158,255,.35)}',
      '#sn-tile .sn-tile-roles,#sn-tile .sn-tile-tabs{display:flex;flex-wrap:wrap;gap:5px;padding:6px 12px}',
      '#sn-tile .sn-role,#sn-tile .sn-tab{border:1px solid rgba(61,158,255,.35);background:rgba(0,12,28,.8);',
      'color:#b8c4d4;border-radius:999px;padding:5px 9px;font:600 10px system-ui;cursor:pointer}',
      '#sn-tile .sn-role.on,#sn-tile .sn-tab.on{border-color:#3d9eff;color:#3d9eff;background:rgba(26,111,212,.2)}',
      '#sn-tile .sn-tile-body{padding:6px 12px 10px;flex:1;overflow:auto;font:12px/1.4 system-ui;',
      'touch-action:pan-y}',
      '#sn-tile .sn-tile-foot{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 12px;border-top:1px solid rgba(26,111,212,.25)}',
      '#sn-tile .sn-btn{border:1px solid rgba(61,158,255,.4);background:rgba(26,111,212,.25);color:#e8f4ff;',
      'border-radius:10px;padding:7px 10px;font:600 11px system-ui;cursor:pointer}',
      '#sn-tile .sn-btn.primary{background:rgba(0,221,136,.2);border-color:rgba(0,221,136,.45);color:#6dffb0}',
      '#sn-tile .sn-empty{color:#5a6a7e;font-size:11px;padding:6px 0}',
      '#sn-tile .sn-photo-row{display:flex;gap:6px;overflow-x:auto;padding:4px 0 10px;margin:0 -2px}',
      '#sn-tile .sn-photo-thumb{width:72px;height:54px;border-radius:8px;object-fit:cover;flex-shrink:0;',
      'border:1px solid rgba(61,158,255,.35);background:#061428}',
      '#sn-tile .sn-link{color:#6ec8ff;text-decoration:none;word-break:break-all}',
      '#sn-tile .sn-link:hover{text-decoration:underline;color:#fff}',
      '#sn-tile .sn-about{display:flex;flex-direction:column;gap:6px;font-size:12px;line-height:1.4}',
      '#sn-tile .sn-menu-head{font-weight:700;color:#3d9eff;margin-bottom:6px;font-size:12px}',
      '#sn-tile .sn-menu-item{display:flex;align-items:center;gap:8px;padding:6px 0;',
      'border-bottom:1px solid rgba(26,111,212,.15)}',
      '#sn-tile .sn-menu-item img{width:40px;height:40px;border-radius:8px;object-fit:cover;background:#0a1a30;flex-shrink:0}',
      '#sn-tile .sn-menu-item.sn-menu-off{opacity:.45}',
      '#sn-tile .sn-menu-meta{flex:1;min-width:0}',
      '#sn-tile .sn-menu-meta b{display:block;color:#e8f4ff;font-size:12px}',
      '#sn-tile .sn-menu-meta span{display:block;font-size:10px;color:#6a8aaa}',
      '#sn-tile .sn-menu-meta em{display:block;color:#6dffb0;font-style:normal;font-weight:700;margin-top:2px;font-size:12px}',
      '#sn-tile .sn-add{width:32px;height:32px;border-radius:8px;border:1px solid rgba(0,221,136,.45);',
      'background:rgba(0,221,136,.15);color:#6dffb0;font-weight:800;cursor:pointer;flex-shrink:0}',
      '#sn-tile .sn-total{margin-top:8px;font-weight:700;color:#6dffb0;font-size:12px}',
      '#sn-tile .sn-fee{font-size:10px;color:#6a8aaa;margin-top:3px}',
      '#sn-tile .sn-post{padding:6px 0;border-bottom:1px solid rgba(26,111,212,.15);font-size:12px}',
      '#sn-tile .sn-compose{display:flex;gap:6px;margin-bottom:8px}',
      '#sn-tile .sn-compose input{flex:1;border-radius:8px;border:1px solid rgba(61,158,255,.35);',
      'background:rgba(0,12,28,.8);color:#e8f4ff;padding:6px 8px;font-size:12px}',
      '#sn-tile .sn-compose button{border:0;border-radius:8px;background:#1a6fd4;color:#fff;padding:6px 10px;cursor:pointer;font-size:12px}',
      '#sn-tile .sn-big{font-size:15px;font-weight:700;margin-bottom:4px}',
      '#sn-tile .sn-tags span{display:inline-block;margin:2px 4px 2px 0;padding:2px 7px;border-radius:999px;',
      'background:rgba(26,111,212,.2);font-size:10px}',
      '.sn-target,.sn-pin{background:transparent!important;border:0!important}',
      '.sn-target-inner,.sn-pin-inner{width:36px;height:36px;border-radius:50%;border:2px solid #3d9eff;background:#061428;',
      'overflow:hidden;display:flex;align-items:center;justify-content:center;cursor:pointer}',
      '.sn-target-inner img,.sn-pin-inner img{width:100%;height:100%;object-fit:cover}',
      '.leaflet-marker-icon.sn-target,.leaflet-marker-icon.sn-pin{margin-left:-18px!important;margin-top:-18px!important}',
    ].join('');
    document.head.appendChild(st);
  }

  function dist(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Pinch (2-finger) + Ctrl/wheel resize on the tile card */
  function bindResize(root) {
    if (!root || root._snResizeBound) return;
    root._snResizeBound = true;
    let pinching = false;
    let startDist = 0;
    let startScale = 1;

    root.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 2) {
          pinching = true;
          startDist = dist(e.touches[0], e.touches[1]);
          startScale = T.scale || 0.78;
          e.preventDefault();
        }
      },
      { passive: false }
    );

    root.addEventListener(
      'touchmove',
      (e) => {
        if (!pinching || e.touches.length !== 2) return;
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        if (startDist < 8) return;
        const ratio = d / startDist;
        T.scale = Math.max(0.55, Math.min(1.35, startScale * ratio));
        applyScale();
      },
      { passive: false }
    );

    root.addEventListener(
      'touchend',
      (e) => {
        if (e.touches.length < 2) {
          if (pinching) {
            pinching = false;
            saveScale();
          }
        }
      },
      { passive: true }
    );

    // Desktop: Ctrl+wheel or trackpad pinch often fires wheel
    root.addEventListener(
      'wheel',
      (e) => {
        if (!T.open) return;
        // pinch-zoom on trackpads often sets ctrlKey
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.04 : 0.04;
        T.scale = Math.max(0.55, Math.min(1.35, (T.scale || 0.78) + delta));
        applyScale();
        saveScale();
      },
      { passive: false }
    );
  }

  /** Remove any legacy CLI strip / feed-button tile DOM */
  function purgeCliTileJunk() {
    try {
      const s = $('cli-tile-strip');
      if (s) s.remove();
      const e = $('cli-tile-expand');
      if (e) e.remove();
      document.querySelectorAll('#cli-log .cli-tile-block').forEach((el) => el.remove());
    } catch (_) {}
  }

  function showOverlay() {
    const root = $('sn-tile');
    if (!root) return;
    if (root.parentElement !== document.body) document.body.appendChild(root);
    root.classList.add('open');
    root.classList.remove('cli-docked', 'overlay-mode');
    root.classList.toggle('sn-tile-peek', T.sizeMode !== 'full');
    root.classList.toggle('sn-tile-full', T.sizeMode === 'full');
    root.setAttribute('aria-hidden', 'false');
    root.style.display = 'block';
  }

  function hideOverlay() {
    const root = $('sn-tile');
    if (!root) return;
    root.classList.remove('open', 'cli-docked', 'overlay-mode');
    root.setAttribute('aria-hidden', 'true');
    root.style.display = 'none';
  }

  function bindCardDoubleTap(root) {
    if (!root || root._snDbl) return;
    root._snDbl = true;
    root.addEventListener(
      'click',
      (e) => {
        if (!T.open) return;
        // Backdrop click closes full multi-tile
        if (e.target === root) {
          close();
          return;
        }
        const c = root.querySelector('.sn-tile-card');
        if (!c || !c.contains(e.target)) return;
        if (e.target.closest('button, a, input, select, textarea, label')) return;
        const now = Date.now();
        if (now - T.lastCardTap < 380) {
          T.lastCardTap = 0;
          close();
          return;
        }
        T.lastCardTap = now;
      },
      true
    );
  }

  function ensureDom() {
    ensureCss();
    loadScale();
    purgeCliTileJunk();
    if ($('sn-tile')) {
      ensureGripControls();
      bindResize($('sn-tile'));
      bindDragAndResize($('sn-tile'));
      bindCardDoubleTap($('sn-tile'));
      applyScale();
      return;
    }
    const el = document.createElement('div');
    el.id = 'sn-tile';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="sn-tile-card">' +
      gripHtml() +
      '  <div class="sn-tile-cover" id="sn-tile-cover">' +
      '    <button type="button" class="sn-tile-x" id="sn-tile-close" aria-label="Close">×</button>' +
      '    <button type="button" class="sn-tile-edit-cover" id="sn-tile-edit-cover" title="Cover">📷</button>' +
      '    <input type="file" id="sn-tile-cover-file" accept="image/*" hidden />' +
      '  </div>' +
      '  <div class="sn-tile-head">' +
      '    <div class="sn-tile-av-wrap">' +
      '      <img id="sn-tile-av" class="sn-tile-av" alt="" />' +
      '      <button type="button" class="sn-tile-edit-av" id="sn-tile-edit-av" title="Photo">+</button>' +
      '      <input type="file" id="sn-tile-av-file" accept="image/*" hidden />' +
      '    </div>' +
      '    <div class="sn-tile-id">' +
      '      <div id="sn-tile-name" class="sn-tile-name"></div>' +
      '      <div id="sn-tile-handle" class="sn-tile-handle"></div>' +
      '      <div id="sn-tile-bio" class="sn-tile-bio"></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="sn-tile-roles" id="sn-tile-roles"></div>' +
      '  <div class="sn-tile-tabs" id="sn-tile-tabs"></div>' +
      '  <div class="sn-tile-body" id="sn-tile-body"></div>' +
      '  <div class="sn-tile-foot" id="sn-tile-foot"></div>' +
      '  <button type="button" class="sn-tile-resize" id="sn-tile-resize" aria-label="Resize tile" title="Drag to resize"></button>' +
      '</div>';
    document.body.appendChild(el);
    bindSizeButtons();
    $('sn-tile-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });
    el.addEventListener('click', (e) => {
      if (e.target === el && !T.dragging && !T.resizing) close();
    });
    $('sn-tile-edit-cover')?.addEventListener('click', () => $('sn-tile-cover-file')?.click());
    $('sn-tile-edit-av')?.addEventListener('click', () => $('sn-tile-av-file')?.click());
    $('sn-tile-cover-file')?.addEventListener('change', (e) => onFile(e, 'cover'));
    $('sn-tile-av-file')?.addEventListener('change', (e) => onFile(e, 'avatar'));
    bindResize(el);
    bindDragAndResize(el);
    bindCardDoubleTap(el);
    applyScale();
  }

  function onFile(e, kind) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !T.profileId) return;
    const reader = new FileReader();
    reader.onload = () => {
      let url = String(reader.result || '');
      // Cap huge base64 for localStorage safety
      if (url.length > 400000) {
        global.SNCli?.log?.('Image large · using blob URL (session only)', 'dim');
        url = URL.createObjectURL(f);
      }
      global.SNProfiles?.setMedia?.(T.profileId, kind, url);
      render();
    };
    reader.readAsDataURL(f);
  }

  function isMe(p) {
    const me = global.SNProfiles?.me?.();
    return me && p && me.id === p.id;
  }

  function open(profileOrId, opts) {
    ensureDom();
    opts = opts || {};
    T.taskBoard = opts.taskBoard || null;
    const Prof = global.SNProfiles;
    if (!Prof && !T.taskBoard) {
      global.SNCli?.log?.('Profiles offline', 'err');
      return null;
    }
    let p =
      typeof profileOrId === 'string'
        ? Prof?.get?.(profileOrId)
        : profileOrId && profileOrId.id
          ? Prof?.get?.(profileOrId.id) || profileOrId
          : null;
    if (!p && T.taskBoard) {
      p = {
        id: 'task:' + T.taskBoard.task.id,
        name: T.taskBoard.task.title || 'Task',
        handle: '@task',
        bio: 'Delivery task',
        roles: { driver: true },
        lat: T.taskBoard.pickup && T.taskBoard.pickup.lat,
        lng: T.taskBoard.pickup && T.taskBoard.pickup.lng,
      };
    }
    if (!p) p = Prof?.me?.();
    if (!p || !p.id) {
      global.SNCli?.log?.('No tile profile', 'err');
      return null;
    }
    try {
      if (Prof?.upsert && profileOrId && typeof profileOrId === 'object' && !T.taskBoard)
        Prof.upsert(p);
    } catch (_) {}

    // Second click same user while peek → expand for order / full use
    if (
      T.open &&
      T.profileId === p.id &&
      T.sizeMode === 'peek' &&
      opts.expand !== false &&
      opts.forcePeek !== true
    ) {
      expandToFull();
      if (opts.tab) {
        T.tab = opts.tab;
        render();
      }
      global.SNCli?.preview?.((p.name || 'Tile') + ' · full');
      return p;
    }

    T.profileId = p.id;
    T.open = true;
    // Map pins open PEAK (small). Explicit full/openMe can request full.
    const wantFull = opts.full === true || opts.sizeMode === 'full' || opts.expand === true;
    T.sizeMode = wantFull ? 'full' : 'peek';
    if (T.sizeMode === 'peek') {
      T.w = maxPeekW();
      T.h = maxPeekH();
      T.left = null;
      T.top = null;
      // Peek always shows basics first — not huge menu
      T.tab = opts.tab === 'menu' && !wantFull ? 'about' : opts.tab || 'about';
      if (T.taskBoard) T.tab = 'task';
    } else {
      T.w = maxFullW();
      T.h = maxFullH();
      T.left = null;
      T.top = null;
      T.tab = T.taskBoard ? 'task' : opts.tab || defaultTab(p);
    }
    purgeCliTileJunk();
    showOverlay();
    applyScale();
    render();
    // Fill photos / hours / phone / website from Google Places when opening a vendor
    if (
      !T.taskBoard &&
      p.roles?.vendor &&
      global.SNPlacesBusiness &&
      SNPlacesBusiness.enrichProfile &&
      opts.enrich !== false
    ) {
      void SNPlacesBusiness.enrichProfile(p).then(function (enriched) {
        if (!T.open || T.profileId !== p.id) return;
        if (enriched && enriched.id) {
          T.profileId = enriched.id;
          render();
        }
      });
    }
    if (!opts.quiet) {
      global.SNCli?.preview?.(
        (p.name || 'Tile') + (T.sizeMode === 'peek' ? ' · tap again to expand' : '')
      );
    }
    return p;
  }

  /** Delivery / work task multi-tile — price glow + vendor/client addresses */
  function openTask(enriched, opts) {
    opts = opts || {};
    if (!enriched || !enriched.task) {
      if (global.SNTaskBoard && SNTaskBoard.openTaskTile) return SNTaskBoard.openTaskTile(enriched);
      return null;
    }
    ensureDom();
    T.taskBoard = enriched;
    T.profileId = 'task:' + enriched.task.id;
    T.open = true;
    T.sizeMode = 'peek';
    T.w = maxPeekW();
    T.h = maxPeekH();
    T.left = null;
    T.top = null;
    T.tab = 'task';
    const priceLabel =
      enriched.price != null
        ? global.SNCurrency
          ? SNCurrency.format(enriched.price)
          : enriched.price + ' S'
        : '';
    purgeCliTileJunk();
    showOverlay();
    applyScale();
    render();
    global.SNCli?.preview?.('Task · tap Open for full');
    global.SNCli?.preview?.(priceLabel || 'Task');
    return enriched;
  }

  function defaultTab(p) {
    if (p.roles?.vendor) return 'menu';
    if (p.roles?.dating) return 'dating';
    if (p.roles?.driver) return 'drive';
    if (p.roles?.social) return 'social';
    return 'about';
  }

  function close() {
    T.open = false;
    T.taskBoard = null;
    hideOverlay();
  }

  function minimize() {
    close();
  }

  function toggle(profileOrId) {
    const id = profileOrId && (profileOrId.id || profileOrId);
    if (T.open && (!id || T.profileId === id)) close();
    else open(profileOrId);
  }

  /**
   * Map-first: never inject CLI buttons.
   * opts.expand true → open full multi-tile; else map markers only (showProfiles).
   */
  function offer(profileOrMeta, opts) {
    opts = opts || {};
    if (!profileOrMeta) return;
    if (profileOrMeta.task && profileOrMeta.task.id) {
      if (opts.expand) openTask(profileOrMeta);
      return;
    }
    const p =
      typeof profileOrMeta === 'string'
        ? global.SNProfiles?.get?.(profileOrMeta)
        : profileOrMeta;
    if (!p || !p.id) return;
    try {
      global.SNMap?.showProfiles?.();
    } catch (_) {}
    if (opts.expand) open(p, { quiet: true, tab: opts.tab });
  }

  function offerMany(_list) {
    // Map markers only — never CLI buttons
    try {
      global.SNMap?.showProfiles?.();
    } catch (_) {}
  }

  function seedMe() {
    /* no-op */
  }

  function render() {
    const Prof = global.SNProfiles;
    // Task multi-tile (delivery board)
    if (T.tab === 'task' && T.taskBoard) {
      renderTaskBoard(T.taskBoard);
      return;
    }
    const p = Prof?.get?.(T.profileId) || Prof?.me?.();
    if (!p) return;
    T.profileId = p.id;

    const cover = $('sn-tile-cover');
    if (cover) {
      const u = String(p.cover || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      cover.style.backgroundImage = u ? 'url("' + u + '")' : '';
    }
    const av = $('sn-tile-av');
    if (av) {
      av.src = p.avatar || '';
      av.alt = p.name || '';
    }
    if ($('sn-tile-name')) $('sn-tile-name').textContent = p.name || '';
    if ($('sn-tile-handle')) $('sn-tile-handle').textContent = (p.handle || '') + (isMe(p) ? ' · you' : '');
    if ($('sn-tile-bio')) $('sn-tile-bio').textContent = p.bio || '';

    // Role chips
    const rolesEl = $('sn-tile-roles');
    if (rolesEl) {
      const mine = isMe(p);
      rolesEl.innerHTML = Object.keys(Prof.ROLES)
        .map((key) => {
          const meta = Prof.ROLES[key];
          const on = !!p.roles?.[key];
          return (
            '<button type="button" class="sn-role' +
            (on ? ' on' : '') +
            '" data-role="' +
            key +
            '" style="--rc:' +
            meta.color +
            '"' +
            (mine ? '' : ' disabled') +
            '>' +
            meta.emoji +
            ' ' +
            meta.label +
            '</button>'
          );
        })
        .join('');
      rolesEl.querySelectorAll('[data-role]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!isMe(p)) return;
          Prof.toggleRole(p.id, btn.dataset.role);
          render();
          global.SNMap?.showProfiles?.();
          global.SNCli?.log?.(
            'Role ' + btn.dataset.role + ' · ' + (Prof.get(p.id).roles[btn.dataset.role] ? 'ON' : 'off'),
            'ok'
          );
        });
      });
    }

    // Tabs
    const tabs = [];
    tabs.push(['about', 'About']);
    if (p.roles?.vendor) tabs.push(['menu', 'Menu']);
    if (p.roles?.dating) tabs.push(['dating', 'Dating']);
    if (p.roles?.driver) tabs.push(['drive', 'Drive']);
    if (p.roles?.social) tabs.push(['social', 'Social']);
    tabs.push(['cart', 'Cart']);
    if (!tabs.find((t) => t[0] === T.tab)) T.tab = tabs[0][0];

    const tabsEl = $('sn-tile-tabs');
    if (tabsEl) {
      tabsEl.innerHTML = tabs
        .map(
          ([id, label]) =>
            '<button type="button" class="sn-tab' +
            (T.tab === id ? ' on' : '') +
            '" data-tab="' +
            id +
            '">' +
            label +
            '</button>'
        )
        .join('');
      tabsEl.querySelectorAll('[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          T.tab = btn.dataset.tab;
          render();
        });
      });
    }

    const body = $('sn-tile-body');
    const foot = $('sn-tile-foot');
    if (!body || !foot) return;

    if (T.tab === 'about') {
      const hours = p.hours || p.opening_hours || '';
      const sched = global.SNMarket?.verifySchedule?.(p);
      const phone = p.phone || '';
      const web = p.website || '';
      const gmap = p.googleMapsUrl || p.googleUrl || '';
      const peek = T.sizeMode !== 'full';
      if (peek) {
        // Compact basics only — map stays free
        body.innerHTML =
          '<div class="sn-about sn-about-peek">' +
          (p.shopName || p.name
            ? '<div><b>' + esc(p.shopName || p.name) + '</b></div>'
            : '') +
          (p.rating != null
            ? '<div>★ ' + esc(String(p.rating)) + (p.priceBand ? ' · ' + esc(p.priceBand) : '') + '</div>'
            : '') +
          '<div>🕒 ' +
          esc(
            sched?.label ||
              hours ||
              (p.openNow === true ? 'Open now' : p.openNow === false ? 'Closed' : 'Hours —')
          ).slice(0, 48) +
          '</div>' +
          (phone ? '<div>📞 ' + esc(phone) + '</div>' : '') +
          '<div class="sn-empty">Tap Open or + to order / full tile</div>' +
          '</div>';
        foot.innerHTML =
          '<button type="button" class="sn-btn primary" data-act="expand">Open</button>' +
          (p.roles?.vendor
            ? '<button type="button" class="sn-btn" data-act="menu">Menu</button>'
            : '') +
          (phone ? '<button type="button" class="sn-btn" data-act="call">Call</button>' : '');
      } else {
        const photos = Array.isArray(p.photos) ? p.photos.slice(0, 6) : [];
        body.innerHTML =
          '<div class="sn-about">' +
          (photos.length
            ? '<div class="sn-photo-row">' +
              photos
                .map(
                  (u) =>
                    '<img class="sn-photo-thumb" src="' +
                    esc(u) +
                    '" alt="" loading="lazy" />'
                )
                .join('') +
              '</div>'
            : '') +
          (p.address ? '<div>📍 ' + esc(p.address) + '</div>' : '') +
          (isMe(p)
            ? '<div>📍 ' +
              (p.lat != null
                ? Number(p.lat).toFixed(5) + ', ' + Number(p.lng).toFixed(5)
                : 'position · tap Locate') +
              '</div>' +
              '<div style="margin-top:6px;padding:8px 10px;border-radius:10px;border:1px solid rgba(61,158,255,0.25);background:rgba(0,20,40,0.45)">' +
              '<b>Status</b><br/>' +
              'Polygon routing · none (no accepted offers yet)<br/>' +
              'Schedule · not set up<br/>' +
              'Roles · client' +
              (p.roles?.driver ? ' · driver' : '') +
              (p.roles?.vendor ? ' · vendor' : '') +
              '<br/>Accept an offer or set a plan to build your polygon tour.' +
              '</div>'
            : '') +
          (p.shopName
            ? '<div>🏪 ' + esc(p.shopName) + (p.shopKind ? ' · ' + esc(p.shopKind) : '') + '</div>'
            : '') +
          (p.rating != null
            ? '<div>★ ' +
              esc(String(p.rating)) +
              (p.ratingCount ? ' (' + esc(String(p.ratingCount)) + ')' : '') +
              (p.priceBand ? ' · ' + esc(p.priceBand) : '') +
              '</div>'
            : '') +
          '<div>🕒 ' +
          esc(
            sched?.label ||
              hours ||
              (p.openNow === true ? 'Open now' : p.openNow === false ? 'Closed now' : 'Hours not listed')
          ) +
          '</div>' +
          (phone
            ? '<div>📞 <a class="sn-link" href="tel:' +
              esc(phone.replace(/\s+/g, '')) +
              '">' +
              esc(phone) +
              '</a></div>'
            : '') +
          (web
            ? '<div>🌐 <a class="sn-link" href="' +
              esc(web) +
              '" target="_blank" rel="noopener">' +
              esc(web.replace(/^https?:\/\//, '').slice(0, 42)) +
              '</a></div>'
            : '') +
          (gmap
            ? '<div>🗺️ <a class="sn-link" href="' +
              esc(gmap) +
              '" target="_blank" rel="noopener">Google Maps</a></div>'
            : '') +
          (p.vehicle ? '<div>🛵 ' + esc(p.vehicle) + (p.driverOnline ? ' · ONLINE' : '') + '</div>' : '') +
          (p.roles?.worker
            ? '<div>🧰 Worker · ' + esc(p.jobTitle || p.workerRole || 'available') + '</div>'
            : '') +
          (p.lookingFor ? '<div>💕 ' + esc(p.lookingFor) + '</div>' : '') +
          '</div>';
        foot.innerHTML =
          '<button type="button" class="sn-btn" data-act="peek">Small</button>' +
          '<button type="button" class="sn-btn" data-act="fly">Fly map</button>' +
          (phone ? '<button type="button" class="sn-btn" data-act="call">Call</button>' : '') +
          (web ? '<button type="button" class="sn-btn" data-act="website">Website</button>' : '') +
          (isMe(p)
            ? '<button type="button" class="sn-btn primary" data-act="scan">Scan shops</button>'
            : p.roles?.worker
              ? '<button type="button" class="sn-btn primary" data-act="hire">Work offer</button>'
              : p.roles?.dating
                ? '<button type="button" class="sn-btn primary" data-act="date">Date</button>'
                : p.roles?.vendor
                  ? '<button type="button" class="sn-btn primary" data-act="menu">Menu</button>'
                  : '<button type="button" class="sn-btn primary" data-act="message">Message</button>');
      }
    } else if (T.tab === 'menu') {
      // Ensure full orderable menu before paint
      try {
        if (global.SNProfiles?.ensureOrderableMenu) {
          const filled = SNProfiles.ensureOrderableMenu(p);
          if (filled) p = filled;
        }
      } catch (_) {}
      const menu = p.menu || [];
      const hours = p.hours || p.opening_hours || '';
      const sched = global.SNMarket?.verifySchedule?.(p);
      const openBit =
        p.openNow === true
          ? ' · OPEN NOW'
          : p.openNow === false
            ? ' · closed now'
            : '';
      const bandNote = menu.some((m) => m && m.source === 'google-price-band')
        ? '<div class="sn-empty" style="margin-bottom:6px">Google price band · cuisine order slots in S. Vendor can replace with live dish names.</div>'
        : menu.some((m) => m && m.source === 'cuisine-template')
          ? '<div class="sn-empty" style="margin-bottom:6px">Menu from cuisine + live shop data · prices in S · photos from shop.</div>'
          : '';
      body.innerHTML =
        '<div class="sn-menu-head">' +
        esc(p.shopName || p.name) +
        ' · menu</div>' +
        '<div class="sn-empty" style="margin-bottom:6px">🕒 ' +
        esc(sched?.label || hours || 'Hours not listed') +
        openBit +
        (p.phone ? ' · 📞 ' + esc(p.phone) : '') +
        (p.rating != null ? ' · ★' + Number(p.rating).toFixed(1) : '') +
        '</div>' +
        (p.address
          ? '<div class="sn-empty" style="margin-bottom:6px">' + esc(p.address) + '</div>'
          : '') +
        bandNote +
        (menu.length
          ? menu
              .map(function (m) {
                const avail = m.available !== false;
                return (
                  '<div class="sn-menu-item' +
                  (avail ? '' : ' sn-menu-off') +
                  '" data-mid="' +
                  esc(m.id) +
                  '">' +
                  '<img src="' +
                  esc(m.photo || p.avatar || p.cover || '') +
                  '" alt="" loading="lazy" />' +
                  '<div class="sn-menu-meta">' +
                  '<b>' +
                  esc(m.name) +
                  (avail ? '' : ' · unavailable') +
                  '</b>' +
                  '<span>' +
                  esc(m.desc || '') +
                  '</span>' +
                  '<em>' +
                  (window.SNCurrency
                    ? SNCurrency.format(m.price)
                    : Number(m.price).toFixed(2) + ' S') +
                  '</em>' +
                  '</div>' +
                  (avail
                    ? '<button type="button" class="sn-add" data-add="' +
                      esc(m.id) +
                      '">+</button>'
                    : '<span class="sn-add" style="opacity:.35">—</span>') +
                  '</div>'
                );
              })
              .join('')
          : '<div class="sn-empty">No menu yet. Tap Scan shops or fill shops · then reopen. ' +
            (p.phone ? 'Call ' + esc(p.phone) + '. ' : '') +
            (p.website ? 'Website available. ' : '') +
            '</div>');
      foot.innerHTML =
        (p.phone ? '<button type="button" class="sn-btn" data-act="call">Call</button>' : '') +
        (p.website ? '<button type="button" class="sn-btn" data-act="website">Website</button>' : '') +
        '<button type="button" class="sn-btn" data-act="cart">Cart ' +
        (window.SNCurrency ? SNCurrency.format(Prof.cartTotal?.() || 0) : (Prof.cartTotal?.() || 0).toFixed(2) + ' S') +
        '</button>' +
        '<button type="button" class="sn-btn primary" data-act="order">Order + deliver</button>';
      body.querySelectorAll('[data-add]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = (p.menu || []).find((x) => x.id === btn.dataset.add);
          if (!item || item.available === false) return;
          Prof.cartAdd(p.id, item, 1);
          global.SNCli?.log?.(
            'Cart + ' + item.name + ' ' + (window.SNCurrency ? SNCurrency.format(item.price) : item.price + ' S'),
            'ok'
          );
          render();
        });
      });
    } else if (T.tab === 'dating') {
      body.innerHTML =
        '<div class="sn-dating">' +
        '<div class="sn-big">' +
        esc(p.lookingFor || 'Open to meeting') +
        '</div>' +
        '<div class="sn-tags">' +
        (p.interests || [])
          .map((i) => '<span>' + esc(i) + '</span>')
          .join('') +
        '</div>' +
        '<p>Invite via city DNA — same tile, same claim flow.</p>' +
        '</div>';
      foot.innerHTML =
        '<button type="button" class="sn-btn primary" data-act="date">Invite date</button>' +
        '<button type="button" class="sn-btn" data-act="fly">Map</button>';
    } else if (T.tab === 'drive') {
      body.innerHTML =
        '<div class="sn-drive">' +
        '<div class="sn-big">' +
        (p.driverOnline ? '🟢 ONLINE' : '⚫ offline') +
        '</div>' +
        '<div>Vehicle · ' +
        esc(p.vehicle || '—') +
        '</div>' +
        '<div>Rating · ' +
        (p.rating != null ? p.rating : '—') +
        '★</div>' +
        '<p>Open deliveries appear as tasks. Claim from CLI or here.</p>' +
        '</div>';
      foot.innerHTML =
        (isMe(p)
          ? '<button type="button" class="sn-btn primary" data-act="online">' +
            (p.driverOnline ? 'Go offline' : 'Go online') +
            '</button>'
          : '') +
        '<button type="button" class="sn-btn" data-act="claim">Claim delivery</button>';
    } else if (T.tab === 'social') {
      const posts = p.posts || [];
      body.innerHTML =
        (isMe(p)
          ? '<div class="sn-compose"><input id="sn-post-in" placeholder="Post to city…" maxlength="280" /><button type="button" id="sn-post-go">Post</button></div>'
          : '') +
        (posts.length
          ? posts
              .map(
                (x) =>
                  '<div class="sn-post"><div class="sn-post-t">' +
                  esc(x.text) +
                  '</div><div class="sn-post-m">' +
                  new Date(x.t || Date.now()).toLocaleString() +
                  '</div></div>'
              )
              .join('')
          : '<div class="sn-empty">No posts yet</div>');
      foot.innerHTML = '<button type="button" class="sn-btn" data-act="fly">Show on map</button>';
      $('sn-post-go')?.addEventListener('click', () => {
        const v = $('sn-post-in')?.value?.trim();
        if (!v) return;
        Prof.addPost(p.id, v);
        render();
      });
    } else if (T.tab === 'cart') {
      const items = Prof.cart() || [];
      body.innerHTML = items.length
        ? items
            .map(
              (i) =>
                '<div class="sn-menu-item">' +
                '<img src="' +
                esc(i.photo) +
                '" alt="" />' +
                '<div class="sn-menu-meta"><b>' +
                esc(i.name) +
                '</b><span>' +
                esc(i.vendorName) +
                '</span><em>' +
                (window.SNCurrency ? SNCurrency.format(i.price) : Number(i.price).toFixed(2) + ' S') +
                ' ×' +
                (i.qty || 1) +
                '</em></div></div>'
            )
            .join('') +
          '<div class="sn-total">Total ' +
          (window.SNCurrency ? SNCurrency.format(Prof.cartTotal()) : Prof.cartTotal().toFixed(2) + ' S') +
          '</div>'
        : '<div class="sn-empty">Cart empty · open a vendor menu</div>';
      foot.innerHTML =
        '<button type="button" class="sn-btn" data-act="clear">Clear</button>' +
        '<button type="button" class="sn-btn primary" data-act="order">Order + deliver</button>';
    }

    foot.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => void act(btn.dataset.act, p));
    });
  }

  function renderTaskBoard(e) {
    if (!e || !e.task) return;
    const body = $('sn-tile-body');
    const foot = $('sn-tile-foot');
    const nameEl = $('sn-tile-name');
    const handle = $('sn-tile-handle');
    const roles = $('sn-tile-roles');
    if (nameEl) nameEl.textContent = e.task.title || 'Task';
    if (handle) handle.textContent = (e.task.status || 'open') + ' · ' + (e.task.kind || 'delivery');
    if (roles) roles.innerHTML = '<span class="sn-role on">TASK</span>';
    const priceBlock =
      global.SNTaskBoard && SNTaskBoard.priceHtml
        ? SNTaskBoard.priceHtml(e.price)
        : '<span class="sn-task-price">' +
          (e.price != null ? Number(e.price).toFixed(2) + ' S' : '— S') +
          '</span>';
    if (body) {
      body.innerHTML =
        priceBlock +
        '<div class="sn-task-party"><div class="lbl">Vendor</div><b>' +
        esc(e.vendorName) +
        '</b><span>' +
        esc(e.vendorAddress) +
        '</span></div>' +
        '<div class="sn-task-party"><div class="lbl">Client</div><b>' +
        esc(e.clientName) +
        '</b><span>' +
        esc(e.clientAddress) +
        '</span></div>' +
        '<p style="font-size:11px;color:#6a8aaa;margin:0">All your task routes stay on the map · arrange multi-stops</p>';
    }
    if (foot) {
      foot.innerHTML =
        '<div class="sn-task-actions">' +
        '<button type="button" class="sn-btn primary" data-tact="preview">Map routes</button>' +
        '<button type="button" class="sn-btn" data-tact="claim">Claim</button>' +
        '<button type="button" class="sn-btn" data-tact="close">Close</button>' +
        '</div>';
      foot.querySelectorAll('[data-tact]').forEach((btn) => {
        btn.onclick = (ev) => {
          ev?.preventDefault?.();
          const a = btn.getAttribute('data-tact');
          if (a === 'close') close();
          else if (a === 'preview') {
            void global.SNTaskBoard?.previewTaskOnMap?.(e.task, { fit: true, force: true });
          } else if (a === 'claim') {
            const r = global.SNTasks?.claim?.(e.task.id);
            if (r?.ok) {
              global.SNCli?.log?.('Claimed · ' + r.task.title, 'ok');
              T.taskBoard = global.SNTaskBoard?.enrich?.(r.task) || e;
              render();
              void global.SNTaskBoard?.previewTaskOnMap?.(r.task, { fit: true, force: true });
            }
          }
        };
      });
    }
  }

  async function act(name, p) {
    const Prof = global.SNProfiles;
    if (name === 'call') {
      if (p.phone) {
        try {
          global.location.href = 'tel:' + String(p.phone).replace(/\s+/g, '');
        } catch (_) {}
        global.SNCli?.log?.('Calling ' + p.phone, 'ok');
      }
      return;
    }
    if (name === 'website') {
      if (p.website) {
        try {
          global.open(p.website, '_blank', 'noopener');
        } catch (_) {}
      }
      return;
    }
    if (name === 'menu') {
      if (T.sizeMode !== 'full') expandToFull();
      T.tab = 'menu';
      render();
      return;
    }
    if (name === 'expand') {
      expandToFull();
      if (p.roles?.vendor) T.tab = 'menu';
      render();
      return;
    }
    if (name === 'peek') {
      collapseToPeek();
      return;
    }
    if (name === 'fly') {
      if (p.lat != null) {
        global.SNGlobe?.goToPlace?.(p.lat, p.lng, {
          tier: 'national',
          openMap: false,
          skipScan: true,
          label: p.name || p.shopName || 'Target',
        });
        await global.SNMap?.open?.(p.lat, p.lng);
        global.SNMap?.showProfiles?.();
      }
      return;
    }
    if (name === 'seed' || name === 'scan') {
      // SPECS P0-D: live DB + crawlers only — never seedCity NPCs
      global.SNCli?.log?.('Live sector scan · DB + Overpass + crawl…', 'dim');
      if (typeof window.snToast === 'function') window.snToast('Live scan…', 'info');
      const r =
        (global.SNCommerce?.ensureSector &&
          (await global.SNCommerce.ensureSector(p.lat, p.lng, { openMap: true }))) ||
        null;
      const n = r?.count || 0;
      global.SNCli?.log?.(
        n
          ? 'Sector live · ' + n + ' shop tiles · ' + (r.source || 'live')
          : 'Sector empty · long-press map to create tile · or fly elsewhere',
        n ? 'ok' : 'dim'
      );
      if (typeof window.snToast === 'function') {
        window.snToast(
          n ? 'Live: ' + n + ' vendors · ' + (r.source || 'scan') : 'Empty sector · create or fly',
          n ? 'ok' : 'err'
        );
      }
      render();
      return;
    }
    if (name === 'message') {
      global.SNCli?.log?.('Message · ' + p.name + ' · ' + (p.handle || ''), 'ok');
      global.SNCli?.log?.('Tip: date coffee · or order from their menu', 'dim');
      return;
    }
    if (name === 'date') {
      const t = global.SNTasks?.create?.({
        kind: 'dating',
        role: 'coffee',
        title: '💕 Date invite · ' + p.name,
        raw: 'date with ' + p.name,
        lat: p.lat,
        lng: p.lng,
        targetId: p.id,
      });
      global.SNCli?.log?.('Dating request · ' + (t?.title || p.name), 'ok');
      global.SNMap?.showTasks?.();
      return;
    }
    if (name === 'hire') {
      const role = p.workerRole || p.jobTitle || 'worker';
      const t = global.SNTasks?.create?.({
        kind: 'job',
        role: String(role).toLowerCase().slice(0, 24),
        title: '🧰 Work offer · ' + (p.name || role) + ' · 3h',
        dur: '3h',
        raw: 'hire ' + (p.name || role),
        lat: p.lat,
        lng: p.lng,
        targetId: p.id,
        targetName: p.name,
      });
      const sched = global.SNMarket?.verifySchedule?.(p);
      global.SNCli?.log?.(
        'Work offer → ' + (p.name || role) + ' · ' + (t?.title || '') + ' · ' + (sched?.label || '24/7'),
        'ok'
      );
      global.SNMap?.showTasks?.();
      return;
    }
    if (name === 'online') {
      p.driverOnline = !p.driverOnline;
      p.roles.driver = true;
      Prof.upsert(p);
      global.SNCli?.log?.(p.driverOnline ? 'Driver ONLINE on map' : 'Driver offline', 'ok');
      global.SNMap?.showProfiles?.();
      render();
      return;
    }
    if (name === 'claim') {
      const open = (global.SNTasks?.list?.({ kind: 'delivery' }) || []).filter(
        (t) => t.status === 'open'
      );
      const r = global.SNTasks?.claim?.(open[0]?.id);
      if (r?.ok) {
        global.SNCli?.log?.('Claimed · ' + r.task.title, 'ok');
        global.SNMap?.showTasks?.();
        render();
      } else {
        global.SNCli?.log?.(r?.error || 'No open deliveries · place an order first', 'dim');
      }
      return;
    }
    if (name === 'cart') {
      T.tab = 'cart';
      render();
      return;
    }
    if (name === 'clear') {
      Prof.cartClear();
      render();
      return;
    }
    if (name === 'order') {
      const r = Prof.placeOrder();
      if (!r.ok) {
        global.SNCli?.log?.(r.error || 'order failed', 'err');
        return;
      }
      const fmt = (n) =>
        window.SNCurrency ? SNCurrency.format(n) : Number(n).toFixed(2) + ' S';
      global.SNCli?.log?.('Order placed · ' + fmt(r.total) + ' · 24/7 marketplace', 'ok');
      global.SNCli?.log?.(
        'Fees · platform ' +
          fmt(r.platformFee || r.total * 0.03) +
          ' · driver ' +
          fmt(r.driverCut || r.total * 0.15),
        'dim'
      );
      global.SNCli?.log?.(
        r.task
          ? 'Delivery task ' + r.task.id + ' · drivers: claim from Drive tab or CLI task claim'
          : 'Delivery open',
        'ok'
      );
      global.SNField?.paint?.();
      if (p.lat != null) await global.SNMap?.open?.(p.lat, p.lng);
      global.SNMap?.showTasks?.();
      global.SNMap?.showProfiles?.();
      T.tab = 'cart';
      render();
      return;
    }
  }

  function openMe(tab) {
    const Prof = global.SNProfiles;
    if (!Prof) {
      global.SNCli?.log?.('Profiles offline · cannot open your tile', 'err');
      return null;
    }
    // Always ensure a real me profile exists and is geo-synced
    let me = Prof.me?.();
    if (!me || !me.id) {
      global.SNCli?.log?.('No me profile · try Login or hard refresh', 'err');
      return null;
    }
    try {
      const pos =
        global._snLastPos ||
        global.SNTasks?.pos ||
        (me.lat != null ? { lat: me.lat, lng: me.lng } : null);
      if (pos && pos.lat != null) {
        me.lat = Number(pos.lat);
        me.lng = Number(pos.lng);
      }
      if (!me.name || me.name === 'Astranov User') {
        me.name =
          global.SNAuth?.user?.user_metadata?.full_name ||
          global.SNAuth?.user?.email?.split?.('@')?.[0] ||
          me.name ||
          'You';
      }
      if (!me.bio) me.bio = 'SpaceNet citizen · client · marketplace in S';
      if (!me.roles) me.roles = { social: true, client: true };
      me.roles.client = true;
      me.roles.social = true;
      if (Prof.upsert) me = Prof.upsert(me) || me;
    } catch (_) {}

    const opened = open(me, {
      tab: tab || 'about',
      quiet: false,
      full: true,
      sizeMode: 'full',
      expand: true,
    });
    try {
      // Center full me tile — never empty strip on the side
      T.sizeMode = 'full';
      T.w = maxFullW();
      T.h = maxFullH();
      T.left = Math.max(12, Math.round((window.innerWidth - T.w) / 2));
      T.top = Math.max(48, Math.round((window.innerHeight - T.h) / 3));
      const root = $('sn-tile');
      if (root) {
        root.classList.add('owner-me');
        root.classList.remove('sn-tile-peek');
        root.classList.add('sn-tile-full');
        bindDragAndResize(root);
      }
      applyScale();
      render();
      global.SNCli?.log?.(
        'YOU · ' + (me.name || 'You') + ' · profile tile open',
        'ok'
      );
      global.SNCli?.preview?.('YOU · me tile');
    } catch (_) {}
    return opened || me;
  }

  /**
   * Multi-tile create — only via long-press on map or intentional + .
   * Never short-click.
   */
  function createAt(lat, lng, opts) {
    const Prof = global.SNProfiles;
    if (!Prof || lat == null || lng == null) return null;
    opts = opts || {};
    const id =
      'place_' +
      String(Number(lat).toFixed(4) + '_' + Number(lng).toFixed(4))
        .replace(/\./g, 'p')
        .replace(/-/g, 'm');
    const existing = Prof.get?.(id);
    if (existing) {
      return open(existing, { tab: opts.tab || 'about' });
    }
    const p = Prof.upsert({
      id,
      name: opts.name || 'Place ' + Number(lat).toFixed(3) + '°',
      handle: '@place',
      bio: 'Long-press created · set roles · menu · social',
      cover: '',
      avatar: '',
      lat: Number(lat),
      lng: Number(lng),
      roles: { social: true, client: true, vendor: false, driver: false, dating: false, worker: false },
      posts: [{ id: 'p0', text: 'New multi-tile on SpaceNet', t: Date.now() }],
      menu: [],
    });
    global._snLastPos = { lat: Number(lat), lng: Number(lng) };
    try {
      global.SNTasks?.setPos?.(Number(lat), Number(lng));
    } catch (_) {}
    const opened = open(p, { tab: opts.tab || 'about' });
    try {
      global.SNMap?.showProfiles?.();
    } catch (_) {}
    global.SNCli?.log?.(
      'Multi-tile created · ' + Number(lat).toFixed(4) + ', ' + Number(lng).toFixed(4),
      'ok'
    );
    return opened || p;
  }

  function init() {
    ensureDom();
    purgeCliTileJunk();
    document.getElementById('btn-tile')?.addEventListener('click', () => openMe());
    const fab = document.getElementById('sn-plus');
    if (fab && !fab._snBound) {
      fab._snBound = true;
      fab.addEventListener('click', (e) => {
        e.preventDefault();
        const pos = global._snLastPos || global.SNTasks?.pos || { lat: 36.4341, lng: 28.2176 };
        if (global.SNMap?.active) createAt(pos.lat, pos.lng);
        else openMe();
      });
    }
  }

  global.SNTile = {
    init,
    open,
    openMe,
    openTask,
    createAt,
    close,
    minimize,
    toggle,
    render,
    offer,
    offerMany,
    seedMe,
    expandToFull,
    collapseToPeek,
    get sizeMode() {
      return T.sizeMode;
    },
    get openId() {
      return T.profileId;
    },
    get isOpen() {
      return T.open;
    },
  };
})(window);
