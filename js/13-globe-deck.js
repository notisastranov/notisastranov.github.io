// === GLOBE DECK — one scrollable window over the globe ===
const GlobeDeck = {
  expanded: false,
  activeTask: null,
  thinking: false,
  _size: 'collapsed',
  _touchY: 0,
  _touchT: 0,
  _collapseTimer: null,
  _thinkLine: null,
  _composeLine: null,
  _lastSay: '',
  _lastSayT: 0,
  _userEngaged: false,
  _expandAt: 0,
  _handleDrag: 0,
  _lastResizeDrag: 0,
  _freeHeight: 0,
  _HEIGHT_KEY: 'astranov-deck-height',
  _scrollTouch: false,
  _NOISE_RE: /^(thinking|warming|owner-sync|heartbeat|field_pulse|subscribe|channel joined|token refresh|postgres_changes|Map live|Ghost route|hands-free on|Coders always|session held|pull failed)/i,

  init() {
    CliRibbon?.init?.();
    AppShortcuts?.init?.();
    this._restoreHeight();
    this.bindDeckResize();
    this.bindDeckGestures();
    ['sat-radio', 'node-batch', 'vendor-menu', 'globe-youtube', 'globe-super-add', 'globe-site-browser', 'cli-hub-panel'].forEach(id => {
      const el = document.getElementById(id);
      const stage = document.getElementById('globe-deck-stage');
      if (el && stage && el.parentElement !== stage) stage.appendChild(el);
    });
    CliRibbon?.setActive?.('CLI');
    if (this._size === 'free' && this._freeHeight) this.applySize();
  },

  _deckMinH() { return 118; },
  _deckMaxH() { return Math.min(window.innerHeight * 0.94, window.innerHeight - 36); },

  _deckInteractive(target) {
    return target?.closest?.('button, input, textarea, select, form, a, [contenteditable], #aci-cli-form, label');
  },

  _deckCanScroll(el, fingerDy) {
    if (!el) return false;
    const max = el.scrollHeight - el.clientHeight;
    if (max < 4) return false;
    if (fingerDy < 0 && el.scrollTop > 0) return true;
    if (fingerDy > 0 && el.scrollTop < max - 1) return true;
    return false;
  },

  bindDeckResize() {
    const deck = this.deck();
    if (!deck || deck._resizeBound) return;
    deck._resizeBound = true;
    let active = false;
    let resizing = false;
    let sy = 0;
    let sh = 0;
    let moved = 0;
    let scrollEl = null;

    const applyHeight = (nh) => {
      const d = this.deck();
      if (!d) return;
      nh = Math.min(this._deckMaxH(), Math.max(this._deckMinH(), nh));
      d.style.maxHeight = nh + 'px';
      d.style.minHeight = nh + 'px';
      d.classList.remove('collapsed', 'size-third', 'size-full');
      d.classList.add('expanded', 'deck-resizing');
      this.expanded = nh > 130;
      this._size = 'free';
      if (window.AciCli) AciCli.open = this.expanded;
    };

    const finish = () => {
      const d = this.deck();
      if (!d) return;
      d.classList.remove('deck-resizing');
      if (resizing || moved > 10) {
        this._lastResizeDrag = Date.now();
        const h = d.getBoundingClientRect().height;
        if (h < 130) this._size = 'collapsed';
        else { this._size = 'free'; this._saveHeight(h); }
        this.applySize();
      }
      active = false;
      resizing = false;
      scrollEl = null;
      moved = 0;
    };

    const onMove = (clientY, e) => {
      if (!active) return;
      const dy = sy - clientY;
      moved = Math.max(moved, Math.abs(dy));
      if (!resizing && scrollEl && this._deckCanScroll(scrollEl, dy) && moved < 28) return;
      if (moved < 6) return;
      resizing = true;
      if (e?.cancelable) e.preventDefault();
      applyHeight(sh + dy);
    };

    const onStart = (clientY, target) => {
      if (this._deckInteractive(target)) return;
      scrollEl = target?.closest?.('#globe-deck-log, #globe-deck-stage');
      active = true;
      resizing = false;
      sy = clientY;
      sh = deck.getBoundingClientRect().height;
      moved = 0;
    };

    deck.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      onStart(e.touches[0].clientY, e.target);
    }, { passive: true });

    deck.addEventListener('touchmove', (e) => {
      if (!active || e.touches.length !== 1) return;
      onMove(e.touches[0].clientY, e);
    }, { passive: false });

    deck.addEventListener('touchend', () => finish(), { passive: true });
    deck.addEventListener('touchcancel', () => finish(), { passive: true });

    deck.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this._deckInteractive(e.target)) return;
      onStart(e.clientY, e.target);
    });

    window.addEventListener('mousemove', (e) => {
      if (!active) return;
      onMove(e.clientY, e);
    });

    window.addEventListener('mouseup', () => {
      if (!active) return;
      finish();
    });
  },

  _isMobileDeck() {
    try {
      return (navigator.maxTouchPoints > 0 && window.innerWidth < 900)
        || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    } catch (_) {
      return window.innerWidth < 900;
    }
  },

  _mobileDeckCap() {
    return Math.min(Math.round(window.innerHeight * 0.38), 320);
  },

  _restoreHeight() {
    try {
      const h = parseInt(localStorage.getItem(this._HEIGHT_KEY), 10);
      const maxH = this._isMobileDeck() ? this._mobileDeckCap() : Math.min(window.innerHeight * 0.94, window.innerHeight - 36);
      if (h >= 118 && h <= maxH) {
        this._freeHeight = Math.min(h, maxH);
      }
    } catch (_) { /* */ }
    this._size = 'collapsed';
    this.expanded = false;
  },

  _saveHeight(h) {
    this._freeHeight = Math.round(h);
    try { localStorage.setItem(this._HEIGHT_KEY, String(this._freeHeight)); } catch (_) { /* */ }
  },

  cycleSize() {
    const order = ['collapsed', 'third', 'full'];
    const i = order.indexOf(this._size);
    this._size = order[(i + 1) % order.length];
    this.applySize();
  },

  applySize() {
    const d = this.deck();
    if (!d) return;
    d.style.maxHeight = '';
    d.style.minHeight = '';
    d.classList.remove('collapsed', 'expanded', 'size-third', 'size-full', 'size-free');
    if (this._size === 'collapsed') {
      d.classList.add('collapsed');
      this.expanded = false;
      if (window.AciCli) AciCli.open = false;
    } else if (this._size === 'free' && this._freeHeight) {
      d.classList.add('expanded', 'size-free');
      d.style.maxHeight = this._freeHeight + 'px';
      d.style.minHeight = this._freeHeight + 'px';
      this.expanded = true;
      if (window.AciCli) AciCli.open = true;
    } else {
      d.classList.add('expanded', this._size === 'full' ? 'size-full' : 'size-third');
      this.expanded = true;
      if (window.AciCli) AciCli.open = true;
    }
    CliRibbon?.render?.();
  },

  bindDeckGestures() {
    /* scroll lives in log/stage via touch-action:pan-y; resize is bindDeckResize on whole deck */
  },

  deck() { return document.getElementById('globe-deck'); },
  logEl() { return document.getElementById('globe-deck-log'); },

  setTitle(text) {
    CliRibbon?.setActive?.(text || CliRibbon?.TASK_LABEL?.[this.activeTask] || 'CLI');
  },

  _repairLine(text, kind) {
    return ArcangeloDialect?.repairOutbound?.(text, kind) ?? String(text || '');
  },

  setPreview(text) {
    const s = this._repairLine(text, 'out').slice(0, 120);
    if (s && CliRibbon?.isGlobeHint?.(s)) return;
    if (s) CliRibbon?.setNotice?.(s);
    else CliRibbon?.clearNotice?.();
    if (!this.expanded && s) this.deck()?.classList.add('has-preview');
    else if (!s) this.deck()?.classList.remove('has-preview');
  },

  setMapStatus(text) {
    const s = this._repairLine(text, 'map');
    if (!s || CliRibbon?.isGlobeHint?.(s)) return;
    this.setPreview(s);
  },

  shouldLog(text, kind) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (CliRibbon?.isGlobeHint?.(t)) return false;
    if (kind !== 'reply' && kind !== 'ok' && kind !== 'out' && kind !== 'err' && kind !== 'cmd' && CliRibbon?.MOTTO_RE?.test(t)) return false;
    if (this._NOISE_RE.test(t)) return false;
    if (kind === 'dim' && /^(◎|…|\.{2,})\s/.test(t) && t.length < 90) return false;
    if (/^\{.*\}$/.test(t) || /^HTTP \d/.test(t)) return false;
    return true;
  },

  setCompose(text) {
    const t = String(text || '');
    if (this._composeLine?.parentNode) this._composeLine.remove();
    this._composeLine = null;
    const input = document.getElementById('aci-cli-in');
    if (!input) return;
    if (t && document.activeElement !== input && !input.value) {
      input.value = t;
      if (window.AciCli) AciCli.buffer = t;
    }
    window.resizeCliInput?.(input);
  },

  clearCompose() {
    this.setCompose('');
    const input = document.getElementById('aci-cli-in');
    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }
    if (window.AciCli) AciCli.buffer = '';
  },

  log(text, cls) {
    const kind = cls || 'out';
    const repaired = this._repairLine(text, kind);
    if (kind === 'map') {
      this.setMapStatus(repaired);
      return;
    }
    if (!this.shouldLog(repaired, kind)) return;
    const out = this.logEl();
    if (!out) return;
    if (kind === 'dim') {
      if (this._thinkLine?.parentNode) {
        this._thinkLine.textContent = repaired;
        return;
      }
      const el = document.createElement('div');
      el.className = 'deck-line deck-dim';
      el.textContent = repaired;
      out.appendChild(el);
      while (out.children.length > 48) out.removeChild(out.firstChild);
      out.scrollTop = out.scrollHeight;
      return;
    }
    const key = kind + ':' + repaired.slice(0, 100);
    const now = Date.now();
    if (this._lastSay === key && now - this._lastSayT < 5000) return;
    this._lastSay = key;
    this._lastSayT = now;
    if (kind === 'cmd' || kind === 'err') this.expand();
    else if (this._userEngaged && this.expanded && (kind === 'reply' || kind === 'out' || kind === 'ok')) { /* stay open */ }
    const row = document.createElement('div');
    row.className = 'deck-line deck-' + kind;
    row.textContent = repaired;
    out.appendChild(row);
    while (out.children.length > 48) out.removeChild(out.firstChild);
    out.scrollTop = out.scrollHeight;
    if (kind === 'reply' || kind === 'out' || kind === 'ok') {
      this._userEngaged = true;
      this.setPreview(repaired);
      CliRibbon?.setNotice?.(repaired.slice(0, 120), 'ready');
      const prev = document.getElementById('globe-deck-preview');
      if (prev) prev.textContent = repaired.slice(0, 120);
      if (!this.expanded && this._isMobileDeck()) {
        this.deck()?.classList.add('has-preview');
        this.ping();
      }
    }
    if (kind === 'err') CliRibbon?.setNotice?.(repaired, 'err');
    if (this._userEngaged && (kind === 'reply' || kind === 'out' || kind === 'err')) this.ping();
    if (kind !== 'dim' && kind !== 'map') window.CliHub?.queueLine?.(repaired, kind);
  },

  say(text, cls) {
    this.log(text, cls || 'out');
  },

  onUserMessage(title) {
    this._userEngaged = true;
    if (this._collapseTimer) { clearTimeout(this._collapseTimer); this._collapseTimer = null; }
    const t = title || 'Collective — listening';
    this.setTitle(t);
    this.setPreview(t);
    if (!this._isMobileDeck()) this.expand(t);
    this.ping();
  },

  ping() {
    const d = this.deck();
    if (!d) return;
    d.classList.remove('deck-ping');
    void d.offsetWidth;
    d.classList.add('deck-ping');
    setTimeout(() => d.classList.remove('deck-ping'), 1200);
  },

  setThinking(on, hint) {
    if (this._thinkWatchdog) { clearTimeout(this._thinkWatchdog); this._thinkWatchdog = null; }
    this.thinking = !!on;
    const d = this.deck();
    if (d) d.classList.toggle('deck-thinking', this.thinking);
    if (on && hint) CliRibbon?.setNotice?.(hint, 'thinking');
    CliRibbon?.render?.();
    if (on) {
      this.setPreview(hint || '… thinking');
      if (!this._isMobileDeck()) this.expand(hint || 'Collective — thinking…');
      const out = this.logEl();
      if (out && this.expanded) {
        if (this._thinkLine?.parentNode) this._thinkLine.remove();
        this._thinkLine = document.createElement('div');
        this._thinkLine.className = 'deck-line deck-dim deck-thinking-line';
        this._thinkLine.textContent = this._repairLine(hint || '… thinking', 'dim');
        out.appendChild(this._thinkLine);
        out.scrollTop = out.scrollHeight;
      }
      this._thinkWatchdog = setTimeout(() => {
        this._thinkWatchdog = null;
        if (this.thinking) this.setThinking(false);
      }, 45000);
    } else if (this._thinkLine?.parentNode) {
      this._thinkLine.remove();
      this._thinkLine = null;
    }
  },

  showError(msg) {
    this._userEngaged = true;
    this.expand('Error');
    this.log(msg, 'err');
    this.setPreview(msg);
    this.ping();
  },

  clearLog() {
    const out = this.logEl();
    if (out) out.innerHTML = '';
    this.setPreview('');
  },

  expand(title) {
    const now = Date.now();
    if (title && (!this.expanded || now - this._expandAt > 400)) this.setTitle(title);
    this._expandAt = now;
    if (this._size === 'collapsed') {
      if (this._isMobileDeck()) {
        this._size = 'third';
        this._freeHeight = 0;
      } else {
        const cap = this._mobileDeckCap();
        this._size = (this._freeHeight > 130 && this._freeHeight <= cap) ? 'free' : 'third';
      }
    }
    this.applySize();
    if (window.AciCli) AciCli.open = true;
  },

  bootCollapsed() {
    this._size = 'collapsed';
    this.expanded = false;
    this._userEngaged = false;
    this.thinking = false;
    this.applySize();
    this.deck()?.classList.remove('deck-thinking', 'has-preview', 'deck-ping');
    CliRibbon?.clearNotice?.();
  },

  bootReady() {
    this._userEngaged = false;
    this.thinking = false;
    this._size = 'third';
    this.expanded = true;
    this.applySize();
    this.setTitle(window.PublicCopy?.deckTitle?.() || 'Astranov');
    this.setPreview(window.PublicCopy?.isArchitect?.()
      ? 'Architect · fix · task · starship'
      : 'Type or 🎧 · 🎯 city · + post · date · hire · order');
    this.deck()?.classList.add('has-preview');
    CliRibbon?.setNotice?.(window.PublicCopy?.readyNotice?.() || 'Ready', 'ready');
    if (window.AciCli) AciCli.open = true;
  },

  superAction(action) {
    this._userEngaged = true;
    if (this._collapseTimer) { clearTimeout(this._collapseTimer); this._collapseTimer = null; }
    const base = window.PublicCopy?.deckTitle?.() || 'Astranov';
    // Public: no "collective / mission" jargon
    const tag = action && action !== 'collective' ? (' — ' + action) : '';
    this.expand(base + tag);
  },

  collapse() {
    this._size = 'collapsed';
    this._userEngaged = false;
    this.applySize();
  },

  toggle() {
    this.cycleSize();
  },

  showStage(panelId, task, title) {
    this.hideStage();
    this.activeTask = task || panelId;
    const stage = document.getElementById('globe-deck-stage');
    const d = this.deck();
    if (!stage) return;
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.classList.add('deck-active', 'open');
      if (d) d.classList.add('has-stage');
    } else if (d) {
      d.classList.remove('has-stage');
    }
    this.expand(title || this.stageTitle(panelId));
    AppShortcuts?.track?.(task || panelId, title || this.stageTitle(panelId));
    SuperCli?.setContext?.(SuperCli.inferContext?.());
    ContextTruth?.sync?.();
    AppShortcuts?.render?.();
  },

  hideStage() {
    const stage = document.getElementById('globe-deck-stage');
    if (stage) {
      stage.querySelectorAll('.deck-active').forEach(el => {
        el.classList.remove('deck-active', 'open');
      });
    }
    this.deck()?.classList.remove('has-stage');
    if (window.PmrRadio) PmrRadio.open = false;
    if (window.AstranovNode) window.AstranovNode._open = false;
  },

  stageTitle(panelId) {
    const titles = {
      'vendor-menu': 'Καταστήματα · παραγγελία',
      'node-batch': 'Work together · Astranov node',
      'sat-radio': 'EU PMR Ch 11 · comms',
      'globe-youtube': 'YouTube on globe',
      'globe-super-add': 'Super Add · post video',
      'cli-hub-panel': 'CLI · search & chats',
    };
    return titles[panelId] || 'Collective — globe deck';
  },

  completeTask(task) {
    const keep = ['coders', 'radio', 'batch', 'commerce'];
    if (task === 'cli' && this.activeTask && keep.includes(this.activeTask)) return;
    if (this.activeTask && this.activeTask !== task && task !== 'cli') return;
    if (this._collapseTimer) { clearTimeout(this._collapseTimer); this._collapseTimer = null; }
    const done = task === 'cli' ? this.activeTask : task;
    this.hideStage();
    this.collapse();
    this.activeTask = null;
    if (done) AppShortcuts?.untrack?.(done);
    CliRibbon?.setActive?.('CLI');
    CliRibbon?.clearNotice?.();
    SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
    AppShortcuts?.render?.();
  },

  isOneShotCmd(cmd) {
    const one = new Set([
      'think', 'evolve', 'teach', 'stats', 'owner', 'seed', 'distill', 'council',
      'mode', 'locate', 'gps', 'me', 'drive', 'news', 'roles', 'claim', 'field_stats',
      'deploy', 'help', '?', 'clear', 'logout', 'connect', 'open', 'vendor',
      'dev', 'ui', 'brain', 'status', 'space', 'superspace', 'scenario',
    ]);
    return one.has((cmd || '').toLowerCase());
  },

  finishCliIfOneShot(cmd) {
    if (!this.isOneShotCmd(cmd)) return;
    if (this.activeTask && ['coders', 'radio', 'batch', 'commerce'].includes(this.activeTask)) return;
    if (this._collapseTimer) clearTimeout(this._collapseTimer);
    this._collapseTimer = setTimeout(() => {
      this._collapseTimer = null;
      if (!this.thinking) this.completeTask('cli');
    }, 8000);
  },
};
window.GlobeDeck = GlobeDeck;
