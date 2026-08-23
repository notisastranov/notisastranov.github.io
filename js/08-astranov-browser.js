// === ASTRANOV BROWSER — in-OS web browser for all devices ===
// Tabs + URL bar + history. Internal astranov:// routes + sandboxed https.
window.AstranovBrowser = window.AstranovBrowser || {};
window.AstranovBrowser = {
  version: '20260720-br1',
  _inited: false,
  _tabs: [],
  _active: 0,
  _visible: false,

  init() {
    if (this._inited) return this;
    this._inited = true;
    this._inject();
    this._bind();
    if (!this._tabs.length) {
      this._tabs.push(this._newTab('https://astranov.eu/', 'Astranov'));
    }
    return this;
  },

  _newTab(url, title) {
    return {
      id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      url: url || 'https://astranov.eu/',
      title: title || 'New tab',
      history: [],
      histIdx: -1,
    };
  },

  _inject() {
    if (document.getElementById('os-browser')) return;
    const css = document.createElement('style');
    css.id = 'astranov-browser-css';
    css.textContent = `
#os-browser{display:none;position:fixed;inset:0;z-index:179;background:rgba(0,4,12,.88);flex-direction:column;font:12px/1.35 system-ui,sans-serif;color:#dff}
#os-browser.open{display:flex}
#os-browser-chrome{flex:0 0 auto;padding:calc(8px + env(safe-area-inset-top,0px)) 10px 8px;background:rgba(4,10,22,.96);border-bottom:1px solid rgba(80,140,210,.3);display:flex;flex-direction:column;gap:8px}
#os-browser-tabs{display:flex;gap:4px;overflow-x:auto;align-items:center}
.os-btab{appearance:none;border:1px solid rgba(90,140,200,.28);background:rgba(0,16,36,.55);color:#bcd;border-radius:10px 10px 0 0;padding:6px 10px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;font:inherit}
.os-btab[aria-current="true"]{background:rgba(40,90,160,.35);color:#fff;border-color:rgba(120,180,255,.5)}
.os-btab-close{margin-left:6px;opacity:.7;border:0;background:transparent;color:inherit;cursor:pointer}
#os-browser-nav{display:flex;gap:6px;align-items:center}
#os-browser-nav button{width:36px;height:36px;border-radius:10px;border:1px solid rgba(90,140,200,.35);background:rgba(0,20,40,.55);color:#9cf;cursor:pointer;font-size:14px;flex-shrink:0}
#os-browser-url{flex:1;min-width:0;height:36px;border-radius:12px;border:1px solid rgba(90,150,220,.4);background:rgba(0,0,0,.4);color:#e8f4ff;padding:0 12px;font:12px ui-monospace,system-ui}
#os-browser-stage{flex:1;min-height:0;position:relative;background:#050a12}
#os-browser-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
#os-browser-home{position:absolute;inset:0;overflow:auto;padding:18px;display:none}
#os-browser-home.open{display:block}
#os-browser-home h2{margin:0 0 8px;font-size:16px;color:#8ec8ff}
.os-bgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-top:12px}
.os-blink{border:1px solid rgba(90,150,220,.3);border-radius:14px;padding:14px;background:rgba(0,20,40,.45);color:#def;text-decoration:none;cursor:pointer;font:inherit;text-align:left}
.os-blink strong{display:block;font-size:12px;margin-bottom:4px}
.os-blink small{color:#8ab;font-size:10px}
#os-browser-err{display:none;position:absolute;left:12px;right:12px;bottom:12px;padding:10px 12px;border-radius:12px;background:rgba(40,0,0,.9);border:1px solid #f66;color:#fcc;font-size:11px}
#os-browser-err.open{display:block}
`;
    document.head.appendChild(css);

    const el = document.createElement('div');
    el.id = 'os-browser';
    el.setAttribute('aria-label', 'Astranov Browser');
    el.innerHTML = `
      <div id="os-browser-chrome">
        <div id="os-browser-tabs"></div>
        <form id="os-browser-nav" action="#">
          <button type="button" id="os-b-back" title="Back">←</button>
          <button type="button" id="os-b-fwd" title="Forward">→</button>
          <button type="button" id="os-b-reload" title="Reload">↻</button>
          <button type="button" id="os-b-home" title="Start">⌂</button>
          <input id="os-browser-url" type="url" inputmode="url" enterkeyhint="go" placeholder="Search or enter address" autocomplete="off" spellcheck="false" />
          <button type="submit" id="os-b-go" title="Go">Go</button>
          <button type="button" id="os-b-new" title="New tab">＋</button>
          <button type="button" id="os-b-close" title="Close browser">✕</button>
        </form>
      </div>
      <div id="os-browser-stage">
        <iframe id="os-browser-frame" title="Astranov Browser content" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals" referrerpolicy="no-referrer-when-downgrade"></iframe>
        <div id="os-browser-home" class="open">
          <h2>Astranov Browser</h2>
          <p style="margin:0;color:#9bb;font-size:12px;line-height:1.45">Your OS web browser — open any site, or jump into Astranov spaces. Same account on phone, tablet, and desktop.</p>
          <div class="os-bgrid" id="os-browser-shortcuts"></div>
        </div>
        <div id="os-browser-err"></div>
      </div>`;
    document.body.appendChild(el);
    this._renderShortcuts();
  },

  _renderShortcuts() {
    const host = document.getElementById('os-browser-shortcuts');
    if (!host) return;
    const items = [
      { t: 'Earth desktop', u: 'astranov://home', d: 'Return to globe OS' },
      { t: 'Astranov.eu', u: 'https://astranov.eu/', d: 'Live collective' },
      { t: 'Locate me', u: 'astranov://locate', d: 'City drop-in' },
      { t: 'Market', u: 'astranov://market', d: 'Shops & delivery' },
      { t: 'Create / +', u: 'astranov://plus', d: 'Post & roles' },
      { t: 'AI chat', u: 'astranov://chat', d: 'CLI brain' },
      { t: 'Wikipedia', u: 'https://wikipedia.org/', d: 'Open web' },
      { t: 'OpenStreetMap', u: 'https://www.openstreetmap.org/', d: 'Maps' },
    ];
    host.innerHTML = items.map((i) =>
      `<button type="button" class="os-blink" data-url="${i.u}"><strong>${i.t}</strong><small>${i.d}</small></button>`
    ).join('');
  },

  _bind() {
    document.getElementById('os-browser-nav')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.navigate(document.getElementById('os-browser-url')?.value || '');
    });
    document.getElementById('os-b-back')?.addEventListener('click', () => this.back());
    document.getElementById('os-b-fwd')?.addEventListener('click', () => this.forward());
    document.getElementById('os-b-reload')?.addEventListener('click', () => this.reload());
    document.getElementById('os-b-home')?.addEventListener('click', () => this.showStart());
    document.getElementById('os-b-new')?.addEventListener('click', () => this.newTab());
    document.getElementById('os-b-close')?.addEventListener('click', () => {
      this.hide();
      window.AstranovOS?.setMode?.('home');
    });
    document.getElementById('os-browser-tabs')?.addEventListener('click', (e) => {
      const close = e.target.closest('.os-btab-close');
      const tab = e.target.closest('[data-tab]');
      if (close && tab) {
        e.stopPropagation();
        this.closeTab(tab.getAttribute('data-tab'));
        return;
      }
      if (tab) this.activateTab(tab.getAttribute('data-tab'));
    });
    document.getElementById('os-browser-shortcuts')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-url]');
      if (b) this.navigate(b.getAttribute('data-url'));
    });
    const frame = document.getElementById('os-browser-frame');
    frame?.addEventListener('load', () => {
      try {
        const tab = this._tabs[this._active];
        if (!tab) return;
        // may throw cross-origin
        const u = frame.contentWindow?.location?.href;
        if (u && u !== 'about:blank') {
          tab.url = u;
          tab.title = frame.contentDocument?.title || tab.title || u;
          this._syncChrome();
        }
      } catch (_) {
        /* cross-origin — keep typed URL */
      }
    });
  },

  show(opts = {}) {
    this.init();
    this._visible = true;
    document.getElementById('os-browser')?.classList.add('open');
    if (opts.newTab) this.newTab(opts.url);
    else if (opts.url) this.navigate(opts.url);
    else this._syncChrome();
    setTimeout(() => document.getElementById('os-browser-url')?.focus(), 30);
  },

  hide() {
    this._visible = false;
    document.getElementById('os-browser')?.classList.remove('open');
  },

  newTab(url) {
    this._tabs.push(this._newTab(url || '', 'New tab'));
    this._active = this._tabs.length - 1;
    if (url) this.navigate(url);
    else this.showStart();
    this._syncChrome();
  },

  closeTab(id) {
    const idx = this._tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    this._tabs.splice(idx, 1);
    if (!this._tabs.length) this._tabs.push(this._newTab('', 'New tab'));
    this._active = Math.min(this._active, this._tabs.length - 1);
    this.activateTab(this._tabs[this._active].id);
  },

  activateTab(id) {
    const idx = this._tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    this._active = idx;
    const tab = this._tabs[idx];
    if (!tab.url || tab.url === 'astranov://start') this.showStart();
    else this._loadUrl(tab.url, { push: false });
    this._syncChrome();
  },

  showStart() {
    const tab = this._tabs[this._active];
    if (tab) {
      tab.url = 'astranov://start';
      tab.title = 'Start';
    }
    const home = document.getElementById('os-browser-home');
    const frame = document.getElementById('os-browser-frame');
    home?.classList.add('open');
    if (frame) {
      frame.style.display = 'none';
      try { frame.src = 'about:blank'; } catch (_) {}
    }
    this._hideErr();
    this._syncChrome();
  },

  navigate(raw) {
    const url = this._normalize(raw);
    if (!url) return;
    if (url.startsWith('astranov://')) {
      this._handleInternal(url);
      return;
    }
    this._pushHistory(url);
    this._loadUrl(url, { push: false });
  },

  _normalize(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (s.startsWith('astranov://')) return s;
    // search-like (no scheme, looks like a query)
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s);
    if (!hasScheme && (s.includes(' ') || (!s.includes('.') && !s.includes('/')))) {
      return 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
    }
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) s = 'https://' + s;
    try {
      const u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        this._err('Only http(s) and astranov:// are allowed');
        return '';
      }
      return u.href;
    } catch (_) {
      this._err('Invalid address');
      return '';
    }
  },

  _handleInternal(url) {
    const path = url.replace(/^astranov:\/\//, '').replace(/\/$/, '');
    if (path === 'start' || path === '') {
      this.showStart();
      return;
    }
    if (path === 'home' || path === 'earth' || path === 'globe') {
      this.hide();
      window.AstranovOS?.setMode?.('home');
      return;
    }
    if (path === 'locate') {
      this.hide();
      window.AstranovOS?.actionLocate?.();
      return;
    }
    if (path === 'market' || path === 'shop') {
      this.hide();
      window.AstranovOS?.actionMarket?.();
      return;
    }
    if (path === 'plus' || path === 'create') {
      this.hide();
      window.AstranovOS?.actionPlus?.();
      return;
    }
    if (path === 'chat' || path === 'ai') {
      this.hide();
      window.AstranovOS?.actionChat?.();
      return;
    }
    if (path === 'system') {
      this.hide();
      window.AstranovOS?.setMode?.('system');
      return;
    }
    // default: open live site path
    this._loadUrl('https://astranov.eu/', { push: true });
  },

  _pushHistory(url) {
    const tab = this._tabs[this._active];
    if (!tab) return;
    tab.history = tab.history.slice(0, tab.histIdx + 1);
    tab.history.push(url);
    tab.histIdx = tab.history.length - 1;
    tab.url = url;
    try { tab.title = new URL(url).hostname; } catch (_) { tab.title = url; }
  },

  _loadUrl(url, { push } = {}) {
    if (push) this._pushHistory(url);
    const tab = this._tabs[this._active];
    if (tab) tab.url = url;
    const home = document.getElementById('os-browser-home');
    const frame = document.getElementById('os-browser-frame');
    home?.classList.remove('open');
    if (frame) {
      frame.style.display = 'block';
      try {
        frame.src = url;
      } catch (e) {
        this._err('Could not open page');
      }
    }
    this._hideErr();
    this._syncChrome();
  },

  back() {
    const tab = this._tabs[this._active];
    if (!tab || tab.histIdx <= 0) return;
    tab.histIdx -= 1;
    this._loadUrl(tab.history[tab.histIdx], { push: false });
  },

  forward() {
    const tab = this._tabs[this._active];
    if (!tab || tab.histIdx >= tab.history.length - 1) return;
    tab.histIdx += 1;
    this._loadUrl(tab.history[tab.histIdx], { push: false });
  },

  reload() {
    const tab = this._tabs[this._active];
    if (!tab) return;
    if (tab.url?.startsWith('astranov://')) this._handleInternal(tab.url);
    else {
      const frame = document.getElementById('os-browser-frame');
      try { frame?.contentWindow?.location?.reload(); } catch (_) {
        if (tab.url) frame.src = tab.url;
      }
    }
  },

  _syncChrome() {
    const tab = this._tabs[this._active];
    const urlEl = document.getElementById('os-browser-url');
    if (urlEl && document.activeElement !== urlEl) {
      urlEl.value = tab?.url === 'astranov://start' ? '' : (tab?.url || '');
    }
    const tabs = document.getElementById('os-browser-tabs');
    if (tabs) {
      tabs.innerHTML = this._tabs.map((t) =>
        `<button type="button" class="os-btab" data-tab="${t.id}" aria-current="${t.id === tab?.id ? 'true' : 'false'}">${this._esc(t.title || 'Tab')}<span class="os-btab-close" title="Close">×</span></button>`
      ).join('');
    }
  },

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  _err(msg) {
    const el = document.getElementById('os-browser-err');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('open');
  },

  _hideErr() {
    document.getElementById('os-browser-err')?.classList.remove('open');
  },
};

