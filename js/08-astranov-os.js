// === ASTRANOV OS — multi-device web OS (globe is desktop) ===
/* SPECS: Astranov OS — NO floating dock above CLI.
 * Buttons needed live only in the CLI top handle (#super-cli-bar / #os-cli-handle).
 * Theme: Astranov deep glowing blue + round corners (SPECS.md §3.10, §3.16, §3.18).
 */
window.AstranovOS = window.AstranovOS || {};
window.AstranovOS = {
  version: '20260723-cli-handle',
  mode: 'home',
  _inited: false,
  _apps: null,

  init() {
    if (this._inited) return this;
    this._inited = true;
    this._apps = this._defaultApps();
    this._injectCss();
    this._ensureChrome();
    this._mountHandleIntoCli();
    this._bind();
    this._applyDeviceClass();
    this.setMode('home', { silent: true });
    try { window.AstranovBrowser?.init?.(); } catch (e) { console.warn('[OS] browser init', e); }
    document.documentElement.dataset.astranovOs = this.version;
    console.log('%c[AstranovOS] ready · CLI-handle only · ' + this.version, 'color:#3d9eff;font-weight:700');
    return this;
  },

  _defaultApps() {
    return [
      { id: 'home', name: 'Earth', icon: '🌍', open: () => this.setMode('home') },
      { id: 'browser', name: 'Web', icon: '🧭', open: () => this.openBrowser() },
      { id: 'locate', name: 'Locate', icon: '🎯', open: () => this.actionLocate() },
      { id: 'market', name: 'Market', icon: '🛒', open: () => this.actionMarket() },
      { id: 'chat', name: 'AI', icon: '✦', open: () => this.actionChat() },
      { id: 'plus', name: 'Create', icon: '＋', open: () => this.actionPlus() },
      { id: 'system', name: 'Sys', icon: '⚙', open: () => this.setMode('system') },
    ];
  },

  _applyDeviceClass() {
    const root = document.documentElement;
    const touch = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
    const narrow = matchMedia('(max-width:720px)').matches;
    root.classList.toggle('os-touch', touch);
    root.classList.toggle('os-narrow', narrow);
    root.classList.toggle('os-desktop', !touch && !narrow);
    if (touch || narrow) {
      window._globePerfLite = true;
      try {
        if (window.SlumberManager && !SlumberManager._userPinned) {
          if (SlumberManager.applyTier) SlumberManager.applyTier('conserve', 'os touch default');
          else SlumberManager.tier = 'conserve';
        }
      } catch (_) {}
    }
  },

  _injectCss() {
    if (document.getElementById('astranov-os-css')) return;
    const st = document.createElement('style');
    st.id = 'astranov-os-css';
    st.textContent = `
/* SPECS §3.18 Astranov theme tokens */
:root, [data-theme="dark"]{
  --an-bg:#00040c;
  --an-text:#b8d4f0;
  --an-panel:rgba(0,8,24,0.88);
  --an-border:rgba(26,111,212,0.48);
  --an-accent:#1a6fd4;
  --an-muted:rgba(100,150,200,0.62);
  --ax-void:#00040c;
  --ax-panel:rgba(0,10,28,0.72);
  --ax-panel-strong:rgba(0,8,22,0.88);
  --ax-blue:#1a6fd4;
  --ax-blue-bright:#3d9eff;
  --ax-blue-glow:rgba(26,111,212,0.55);
  --ax-blue-border:rgba(61,158,255,0.45);
  --ax-blue-bg:rgba(0,28,64,0.58);
  --an-radius:16px;
  --an-radius-sm:12px;
  --an-radius-pill:999px;
}
/* SPECS §3.10 / §3.16: NEVER a second floating button bar above CLI */
#os-dock,
#astranov-os-root > #os-dock,
nav#os-dock{
  display:none!important;
  visibility:hidden!important;
  pointer-events:none!important;
  height:0!important;
  overflow:hidden!important;
  opacity:0!important;
}
#app-shortcut-row{
  display:none!important;
}
#aci-bar,#news-ticker,#resource-monitor{
  display:none!important;
}
/* CLI top handle = single chrome for buttons */
#super-cli-bar{
  display:flex!important;
  flex-wrap:nowrap;
  align-items:center;
  gap:6px;
  padding:6px 8px;
  border-radius:var(--an-radius-sm) var(--an-radius-sm) 0 0;
  background:linear-gradient(180deg,rgba(0,24,56,0.92),rgba(0,10,28,0.88));
  border:1px solid var(--ax-blue-border);
  border-bottom:1px solid rgba(26,111,212,0.35);
  box-shadow:0 0 18px var(--ax-blue-glow), inset 0 1px 0 rgba(120,190,255,0.12);
}
#os-cli-handle{
  display:flex;
  align-items:center;
  gap:3px;
  flex:1 1 auto;
  min-width:0;
  overflow-x:auto;
  overflow-y:hidden;
  scrollbar-width:none;
  -webkit-overflow-scrolling:touch;
}
#os-cli-handle::-webkit-scrollbar{display:none}
.os-handle-btn{
  appearance:none;border:0;cursor:pointer;flex-shrink:0;
  width:34px;height:34px;border-radius:var(--an-radius-pill);
  display:inline-flex;align-items:center;justify-content:center;
  background:var(--ax-blue-bg);
  border:1px solid var(--ax-blue-border);
  color:var(--ax-blue-bright);
  font-size:15px;line-height:1;
  box-shadow:0 0 10px rgba(26,111,212,0.25);
  transition:transform .12s, box-shadow .12s, background .12s;
}
.os-handle-btn:active{transform:scale(.94)}
.os-handle-btn[aria-current="true"]{
  background:rgba(26,111,212,0.35);
  box-shadow:0 0 14px var(--ax-blue-glow), inset 0 0 0 1px rgba(120,190,255,.5);
}
#globe-deck{
  border-radius:var(--an-radius)!important;
  border-color:var(--ax-blue-border)!important;
  background:var(--ax-panel-strong)!important;
  box-shadow:0 0 22px rgba(0,0,0,.55), 0 0 28px rgba(26,111,212,.18)!important;
}
#astranov-os-root{position:fixed;inset:0;z-index:175;pointer-events:none;font:12px/1.35 system-ui,sans-serif;color:var(--an-text,#cfe6ff)}
#astranov-os-root *{box-sizing:border-box}
#os-status{pointer-events:none;position:fixed;top:max(6px,env(safe-area-inset-top));left:10px;right:10px;display:flex;justify-content:space-between;align-items:center;z-index:176;font-size:10px;color:rgba(180,210,240,.72);text-shadow:0 1px 4px #000}
#os-status b{color:#3d9eff;font-weight:600;letter-spacing:.04em;text-shadow:0 0 10px var(--ax-blue-glow)}
#os-surface{pointer-events:none;position:fixed;inset:0;z-index:178;display:none}
#os-surface.open{display:block;pointer-events:auto}
#os-surface-panel{position:absolute;left:50%;top:max(56px,env(safe-area-inset-top));transform:translateX(-50%);width:min(720px,96vw);height:min(78vh,820px);border-radius:var(--an-radius);background:rgba(0,8,22,.94);border:1px solid var(--ax-blue-border);box-shadow:0 20px 60px rgba(0,0,0,.55),0 0 40px rgba(26,111,212,.2);display:flex;flex-direction:column;overflow:hidden;backdrop-filter:blur(18px)}
#os-surface-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(80,130,190,.22)}
#os-surface-head b{flex:1;font-size:13px;color:#8ec8ff}
#os-surface-head button{border:1px solid var(--ax-blue-border);background:var(--ax-blue-bg);color:#bcd;border-radius:var(--an-radius-sm);padding:6px 10px;cursor:pointer;font:inherit}
#os-surface-body{flex:1;min-height:0;overflow:auto;padding:12px}
.os-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.os-card{border:1px solid var(--ax-blue-border);background:rgba(0,16,36,.5);border-radius:var(--an-radius-sm);padding:14px 10px;text-align:center;cursor:pointer;color:#def;box-shadow:0 0 12px rgba(26,111,212,.12)}
.os-card:active{transform:scale(.97)}
.os-card i{display:block;font-style:normal;font-size:22px;margin-bottom:6px}
.os-card strong{display:block;font-size:11px}
.os-card small{display:block;margin-top:4px;font-size:9px;color:#8ab}
.os-kv{display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:11px;margin:0}
.os-kv dt{color:#8ab}.os-kv dd{margin:0;color:#e8f4ff;text-align:right}
.os-help{font-size:11px;color:#9bb;line-height:1.45;margin:0 0 12px}
body.os-mode-browser #globe canvas{filter:brightness(.55) saturate(.85)}
body.os-mode-browser #super-cli-bar,body.os-mode-browser #globe-deck,body.os-mode-browser #aci-hud{opacity:.2;pointer-events:none}
`;
    document.head.appendChild(st);
  },

  _ensureChrome() {
    if (document.getElementById('astranov-os-root')) return;
    const root = document.createElement('div');
    root.id = 'astranov-os-root';
    // SPECS: no floating dock nav — only status + surface dialogs
    root.innerHTML = `
      <div id="os-status" aria-hidden="true"><b>ASTRANOV</b><span id="os-status-meta">booting…</span></div>
      <div id="os-surface" aria-hidden="true">
        <div id="os-surface-panel" role="dialog" aria-modal="true">
          <div id="os-surface-head">
            <b id="os-surface-title">Astranov</b>
            <button type="button" id="os-surface-close" title="Close">✕</button>
          </div>
          <div id="os-surface-body"></div>
        </div>
      </div>`;
    document.body.appendChild(root);
    this._tickStatus();
  },

  /** SPECS: mount OS apps into CLI top handle only */
  _mountHandleIntoCli() {
    const bar = document.getElementById('super-cli-bar');
    if (!bar) {
      setTimeout(() => this._mountHandleIntoCli(), 400);
      return;
    }
    // kill unauthorized rows
    ['os-dock', 'app-shortcut-row'].forEach((id) => {
      const n = document.getElementById(id);
      if (n) {
        n.style.display = 'none';
        n.hidden = true;
        n.setAttribute('aria-hidden', 'true');
        if (id === 'os-dock') try { n.remove(); } catch (_) {}
      }
    });
    let handle = document.getElementById('os-cli-handle');
    if (!handle) {
      handle = document.createElement('div');
      handle.id = 'os-cli-handle';
      handle.setAttribute('role', 'toolbar');
      handle.setAttribute('aria-label', 'Astranov CLI handle');
      // Prefer insert after first controls / at start of bar
      const right = document.getElementById('super-cli-edge-right');
      if (right && right.parentNode === bar) bar.insertBefore(handle, right);
      else bar.appendChild(handle);
    }
    handle.innerHTML = this._apps.map((a) => (
      `<button type="button" class="os-handle-btn" data-os-app="${a.id}" title="${a.name}" aria-label="${a.name}">${a.icon}</button>`
    )).join('');
    if (!handle._osBound) {
      handle._osBound = true;
      handle.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-os-app]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute('data-os-app');
        const app = this._apps.find((a) => a.id === id);
        try { app?.open?.(); } catch (err) { console.warn('[OS app]', id, err); }
      });
    }
    // re-mount if bar rebuilds
    if (!this._handleObserver) {
      this._handleObserver = true;
      setInterval(() => {
        if (!document.getElementById('os-cli-handle') || !document.getElementById('super-cli-bar')?.contains(document.getElementById('os-cli-handle'))) {
          this._mountHandleIntoCli();
        }
        // keep dock dead
        const dock = document.getElementById('os-dock');
        if (dock) { dock.style.display = 'none'; dock.hidden = true; }
      }, 2500);
    }
  },

  _bind() {
    document.getElementById('os-surface-close')?.addEventListener('click', () => this.setMode('home'));
    document.getElementById('os-surface')?.addEventListener('click', (e) => {
      if (e.target.id === 'os-surface') this.setMode('home');
    });
    window.addEventListener('resize', () => this._applyDeviceClass(), { passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.mode !== 'home') {
        e.preventDefault();
        this.setMode('home');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        this.openBrowser();
        setTimeout(() => document.getElementById('os-browser-url')?.focus(), 50);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        this.openBrowser({ newTab: true });
      }
    });
    setInterval(() => this._tickStatus(), 4000);
  },

  _tickStatus() {
    const el = document.getElementById('os-status-meta');
    if (!el) return;
    const tier = window.SlumberManager?.tier || (window._globePerfLite ? 'lite' : 'full');
    const phase = document.documentElement.dataset.astranovPhase || '…';
    const net = navigator.onLine ? 'online' : 'offline';
    el.textContent = `${this.mode} · ${phase} · ${tier} · ${net}`;
  },

  setMode(mode, opts = {}) {
    const next = mode || 'home';
    this.mode = next;
    document.body.classList.remove('os-mode-home', 'os-mode-browser', 'os-mode-launcher', 'os-mode-system');
    document.body.classList.add('os-mode-' + next);
    document.querySelectorAll('#os-cli-handle .os-handle-btn').forEach((b) => {
      const id = b.getAttribute('data-os-app');
      b.setAttribute('aria-current', id === next || (next === 'home' && id === 'home') ? 'true' : 'false');
    });
    const surface = document.getElementById('os-surface');
    if (next === 'home') {
      surface?.classList.remove('open');
      if (surface) surface.setAttribute('aria-hidden', 'true');
      try { window.AstranovBrowser?.hide?.(); } catch (_) {}
    } else if (next === 'browser') {
      surface?.classList.remove('open');
      try { window.AstranovBrowser?.show?.(opts); } catch (_) {}
    } else if (next === 'launcher') {
      this._openSurface('Apps', this._launcherHtml());
      try { window.AstranovBrowser?.hide?.(); } catch (_) {}
      this._bindLaunchCards();
    } else if (next === 'system') {
      this._openSurface('System', this._systemHtml());
      try { window.AstranovBrowser?.hide?.(); } catch (_) {}
      this._bindSystemActions();
    }
    if (!opts.silent) this._tickStatus();
  },

  _openSurface(title, html) {
    const surface = document.getElementById('os-surface');
    const body = document.getElementById('os-surface-body');
    const t = document.getElementById('os-surface-title');
    if (t) t.textContent = title;
    if (body) body.innerHTML = html;
    surface?.classList.add('open');
    surface?.setAttribute('aria-hidden', 'false');
  },

  _launcherHtml() {
    const cards = [
      ['🌍', 'Earth', 'Home desktop · SpaceNet globe', () => 'home'],
      ['🧭', 'Browser', 'Web + Astranov pages', () => 'browser'],
      ['🎯', 'Locate', 'Fly to your city', () => 'locate'],
      ['🛒', 'Market', 'Shops & delivery', () => 'market'],
      ['＋', 'Create', 'Post · roles · profile', () => 'plus'],
      ['✦', 'AI Chat', 'Open CLI brain', () => 'chat'],
      ['⚙', 'System', 'Status · performance', () => 'system'],
    ];
    return `<p class="os-help">Astranov OS — one account, every device. Earth is your desktop. Buttons stay on the CLI handle — no second bar.</p>
      <div class="os-card-grid">${cards.map(([i, n, d, id]) =>
        `<button type="button" class="os-card" data-os-launch="${typeof id === 'function' ? id() : id}"><i>${i}</i><strong>${n}</strong><small>${d}</small></button>`
      ).join('')}</div>`;
  },

  _systemHtml() {
    const build = document.querySelector('meta[name="astranov-build"]')?.content || '—';
    const cont = window.AstranovContinuity?.version || '—';
    const ua = navigator.userAgent.replace(/[<>]/g, '');
    return `<p class="os-help">Planetary Internet OS. CLI handle holds all chrome. Astranov theme: round corners · deep glowing blue.</p>
      <dl class="os-kv">
        <dt>Build</dt><dd>${build}</dd>
        <dt>OS</dt><dd>${this.version}</dd>
        <dt>Continuity</dt><dd>${cont}</dd>
        <dt>Phase</dt><dd>${document.documentElement.dataset.astranovPhase || '—'}</dd>
        <dt>Power</dt><dd>${window.SlumberManager?.tier || '—'}</dd>
        <dt>Online</dt><dd>${navigator.onLine ? 'yes' : 'no'}</dd>
      </dl>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">
        <button type="button" class="os-card" id="os-sys-lite" style="min-width:120px"><strong>Lite mode</strong><small>Faster on phones</small></button>
        <button type="button" class="os-card" id="os-sys-full" style="min-width:120px"><strong>Full mode</strong><small>More detail</small></button>
        <button type="button" class="os-card" id="os-sys-reset" style="min-width:120px"><strong>Hard reset</strong><small>Clear cache · reload</small></button>
        <button type="button" class="os-card" id="os-sys-install" style="min-width:120px"><strong>Install tips</strong><small>Add to Home Screen</small></button>
      </div>
      <p class="os-help" style="margin-top:14px;word-break:break-word;opacity:.7">${ua}</p>`;
  },

  _bindLaunchCards() {
    document.getElementById('os-surface-body')?.querySelectorAll('[data-os-launch]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-os-launch');
        if (id === 'browser') this.openBrowser();
        else if (id === 'home') this.setMode('home');
        else if (id === 'system') this.setMode('system');
        else if (id === 'locate') this.actionLocate();
        else if (id === 'market') this.actionMarket();
        else if (id === 'plus') this.actionPlus();
        else if (id === 'chat') this.actionChat();
      });
    });
  },

  _bindSystemActions() {
    document.getElementById('os-sys-lite')?.addEventListener('click', () => {
      window._globePerfLite = true;
      try {
        SlumberManager._userPinned = true;
        if (SlumberManager.applyTier) SlumberManager.applyTier('conserve', 'you asked');
        else SlumberManager.tier = 'conserve';
      } catch (_) {}
      this._tickStatus();
      this.toast('Lite mode on');
    });
    document.getElementById('os-sys-full')?.addEventListener('click', () => {
      window._globePerfLite = false;
      try {
        SlumberManager._userPinned = true;
        if (SlumberManager.applyTier) SlumberManager.applyTier('balanced', 'you asked');
        else SlumberManager.tier = 'balanced';
      } catch (_) {}
      this._tickStatus();
      this.toast('Full mode on');
    });
    document.getElementById('os-sys-reset')?.addEventListener('click', () => {
      try { window.AstranovLogo?.hardReset?.(); } catch (_) {}
      location.reload();
    });
    document.getElementById('os-sys-install')?.addEventListener('click', () => {
      this._openSurface('Install Astranov',
        `<p class="os-help"><b>iPhone / iPad:</b> Safari → Share → Add to Home Screen.<br>
        <b>Android:</b> Chrome menu → Install app / Add to Home screen.<br>
        <b>Desktop:</b> browser install icon in the address bar.<br><br>
        Same account · CLI handle chrome · Astranov blue.</p>
        <button type="button" class="os-card" id="os-sys-back"><strong>Back to System</strong></button>`);
      document.getElementById('os-sys-back')?.addEventListener('click', () => this.setMode('system'));
    });
  },

  openBrowser(opts = {}) {
    this.setMode('browser', opts);
    try { window.AstranovBrowser?.show?.(opts); } catch (e) {
      this.toast('Browser starting…');
      console.warn(e);
    }
  },

  actionLocate() {
    this.setMode('home');
    try {
      if (window.CityLife?.safeLocate) void window.CityLife.safeLocate();
      else if (window.CityLife?.locateAndDropIn) void window.CityLife.locateAndDropIn();
      else document.getElementById('aci-locate')?.click();
    } catch (e) { console.warn('[OS locate]', e); }
  },

  actionMarket() {
    this.setMode('home');
    try {
      if (window.Commerce?.showPicker) window.Commerce.showPicker();
      else if (window.MenuProfilePostTile?.openPlusField) {
        window.MenuProfilePostTile.openPlusField();
        setTimeout(() => document.querySelector('[data-mpp-role="client"],.mpp-role-chip')?.click(), 100);
      } else document.getElementById('super-add-fab')?.click();
    } catch (e) { console.warn('[OS market]', e); }
  },

  actionPlus() {
    this.setMode('home');
    try {
      if (window.MenuProfilePostTile?.openPlusField) window.MenuProfilePostTile.openPlusField();
      else document.getElementById('super-add-fab')?.click();
    } catch (e) { console.warn('[OS plus]', e); }
  },

  actionChat() {
    this.setMode('home');
    try {
      const deck = document.getElementById('globe-deck');
      deck?.classList.add('expanded');
      document.getElementById('aci-cli-in')?.focus();
      window.GlobeDeck?.expand?.();
    } catch (_) {
      document.getElementById('aci-cli-in')?.focus();
    }
  },

  toast(msg) {
    let el = document.getElementById('os-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'os-toast';
      el.style.cssText = 'position:fixed;left:50%;bottom:calc(100px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:300;padding:10px 14px;border-radius:16px;background:rgba(0,20,48,.94);border:1px solid rgba(61,158,255,.45);color:#def;font:12px system-ui;pointer-events:none;opacity:0;transition:opacity .2s;box-shadow:0 0 20px rgba(26,111,212,.35)';
      document.body.appendChild(el);
    }
    el.textContent = String(msg || '');
    el.style.opacity = '1';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { el.style.opacity = '0'; }, 2200);
  },
};

