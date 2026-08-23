// === RESOURCE + MONEY MONITOR — top-right fused field · one universal max total slider ===
// Universal cap = own app use + idle donate, on this device and fleet (never exceed slider %).
const ResourceMonitor = {
  version: '20260718-fuse-topright',
  PREFS_KEY: 'astranov:miner-rig-prefs',
  /** Universal max total load (own + donate) when idling — 0.15…1.0 */
  MAX_KEY: 'astranov:resource-max-total',
  /** legacy key still read once for migration */
  LEGACY_MAX_KEY: 'astranov:resource-max-occupy',
  _timer: null,
  _host: null,
  _collapsed: true,
  _bindTries: 0,

  init() {
    if (this._inited) return;
    this._inited = true;
    window.ResourceMonitor = this;
    // Apply stored cap immediately so miner/fleet respect it before HUD paints
    window._resourceMaxOccupy = this.maxTotal();
    window._resourceMaxTotal = this.maxTotal();
    this._inject();
    this._bind();
    this.refresh(true);
    // 2s tick when collapsed (default) — less main-thread noise
    this._timer = setInterval(() => this.refresh(false), this._collapsed ? 2000 : 1000);
    // Field HUD loads late — re-attach into money chip when it appears
    this._watchFieldHud();
    console.log('%c[ResourceMonitor] fused money+resources · top-right · universal max', 'color:#6cf;font-weight:700');
  },

  _watchFieldHud() {
    let n = 0;
    const t = setInterval(() => {
      n++;
      const fbh = document.getElementById('field-balance-hud');
      if (fbh && !fbh.querySelector('#rm-fuse')) {
        this._mountInto(fbh);
        this._bind();
        this.refresh(true);
      }
      // Remove orphan left/standalone panel once fused
      const orphan = document.getElementById('resource-monitor');
      if (fbh?.querySelector('#rm-fuse') && orphan) orphan.remove();
      if ((fbh?.querySelector('#rm-fuse') && n > 2) || n >= 40) clearInterval(t);
    }, 500);
  },

  _prefs() {
    try { return JSON.parse(localStorage.getItem(this.PREFS_KEY) || '{}'); } catch (_) { return {}; }
  },

  _savePrefs(p) {
    try { localStorage.setItem(this.PREFS_KEY, JSON.stringify(p)); } catch (_) {}
  },

  /**
   * Universal max total resource (0.15–1) including the user's own consumption when idling.
   * Example: 0.80 → app + donate never load device/fleet above 80%.
   */
  maxTotal() {
    try {
      let v = parseFloat(localStorage.getItem(this.MAX_KEY));
      if (!Number.isFinite(v)) {
        const legacy = parseFloat(localStorage.getItem(this.LEGACY_MAX_KEY));
        if (Number.isFinite(legacy)) v = legacy;
      }
      if (Number.isFinite(v)) return Math.min(1, Math.max(0.15, v));
    } catch (_) {}
    return 0.8;
  },

  /** Alias used by FieldHud / SpaceNetMiner */
  maxOccupy() {
    return this.maxTotal();
  },

  setMaxTotal(v) {
    const n = Math.min(1, Math.max(0.15, Number(v) || 0.8));
    try {
      localStorage.setItem(this.MAX_KEY, String(n));
      localStorage.setItem(this.LEGACY_MAX_KEY, String(n));
    } catch (_) {}
    window._resourceMaxOccupy = n;
    window._resourceMaxTotal = n;
    this._applyCapToRuntime(n);
    this._broadcastFleetCap(n);
    return n;
  },

  setMaxOccupy(v) {
    return this.setMaxTotal(v);
  },

  /** Spare fraction available for donate/fleet work when idling: max(0, cap − own) */
  idleDonateBudget() {
    const cap = this.maxTotal();
    const own = this.appLoad();
    return Math.max(0, Math.min(1, cap - own));
  },

  /** Total load if we donated at full budget (for display) */
  projectedTotalLoad() {
    return Math.min(1, this.appLoad() + this.idleDonateBudget());
  },

  donateLoad() {
    // Effective donate share under the universal cap
    const prefs = this._prefs();
    const keys = ['cpu', 'ram', 'storage', 'bandwidth'];
    const any = keys.some(k => prefs[k] !== false);
    if (!any) return 0;
    return this.idleDonateBudget();
  },

  _applyCapToRuntime(n) {
    try {
      if (window.SlumberManager?.applyTier) {
        SlumberManager._userPinned = true;
        // Cap maps to quality tier so idling never over-drives the machine
        let tier = 'gaming';
        if (n <= 0.35) tier = 'slumber';
        else if (n <= 0.55) tier = 'conserve';
        else if (n <= 0.75) tier = 'balanced';
        else if (n <= 0.9) tier = 'full';
        SlumberManager.applyTier(tier, 'universal max ' + Math.round(n * 100) + '%');
      }
      if (window.renderer?.setPixelRatio) {
        // Soft pixel-ratio ceiling from universal max (own + donate headroom)
        const pr = 0.55 + n * 0.7;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pr));
      }
    } catch (_) {}
  },

  _broadcastFleetCap(n) {
    try {
      if (typeof BroadcastChannel === 'undefined') return;
      if (!this._fleetCh) this._fleetCh = new BroadcastChannel('astranov-resource-cap-v1');
      this._fleetCh.postMessage({
        type: 'max_total',
        maxTotal: n,
        from: localStorage.getItem('astranov:miner-node-id') || 'local',
        at: Date.now(),
      });
    } catch (_) {}
    try {
      window.SpaceNetFleet?.setMaxTotal?.(n);
      window.SpaceNetResourceMonitor?.setMaxOccupy?.(n);
    } catch (_) {}
  },

  _listenFleetCap() {
    if (this._fleetListen || typeof BroadcastChannel === 'undefined') return;
    try {
      this._fleetCh = this._fleetCh || new BroadcastChannel('astranov-resource-cap-v1');
      this._fleetCh.onmessage = (ev) => {
        const msg = ev?.data;
        if (!msg || msg.type !== 'max_total') return;
        const n = Number(msg.maxTotal);
        if (!Number.isFinite(n)) return;
        // Fleet peer published a cap — take the min of local preference and peer request is NOT done;
        // each device applies its own user slider. Peers only mirror if tagged fleet-sync.
        if (msg.fleetSync) {
          try {
            localStorage.setItem(this.MAX_KEY, String(Math.min(1, Math.max(0.15, n))));
          } catch (_) {}
          window._resourceMaxOccupy = n;
          window._resourceMaxTotal = n;
          this.refresh(true);
        }
      };
      this._fleetListen = true;
    } catch (_) {}
  },

  inventory() {
    const nav = navigator;
    const mem = nav.deviceMemory || 0;
    const cores = nav.hardwareConcurrency || 2;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    let heap = 0; let heapLimit = 0;
    try {
      if (performance.memory) {
        heap = performance.memory.usedJSHeapSize / 1048576;
        heapLimit = performance.memory.jsHeapSizeLimit / 1048576;
      }
    } catch (_) {}
    return {
      cores,
      ramGb: mem || 0,
      heapMb: Math.round(heap),
      heapLimitMb: Math.round(heapLimit),
      netMbps: conn?.downlink || 0,
      online: nav.onLine !== false,
      saveData: !!conn?.saveData,
    };
  },

  appLoad() {
    let load = 0.12;
    try {
      if (typeof FieldHud?.deviceLoad === 'function') load = Math.max(load, FieldHud.deviceLoad());
    } catch (_) {}
    try {
      const fps = SlumberManager?._avgFps?.();
      if (fps > 0) load = Math.max(load, Math.min(1, (55 - fps) / 40));
    } catch (_) {}
    try {
      if (performance.memory) {
        load = Math.max(load, Math.min(1, performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit));
      }
    } catch (_) {}
    // Active UI — treat as higher own consumption
    try {
      if (window.GlobeDeck?.thinking || window.DrivingView?.active || window._handsFreeVoice) {
        load = Math.max(load, 0.75);
      }
    } catch (_) {}
    return Math.min(1, Math.max(0, load));
  },

  moneySnapshot() {
    const Coins = document.getElementById('fbh-avc')?.textContent || '— Coins';
    const rate = document.getElementById('fbh-mine-rate')?.textContent
      || document.getElementById('mrp-rate')?.textContent
      || '0/h';
    const earned = document.getElementById('fbh-mine-earned')?.textContent || '+0';
    const peers = document.getElementById('fbh-peers')?.textContent || '0 peers';
    const eur = document.getElementById('fbh-eur')?.textContent || '';
    const usd = document.getElementById('fbh-usd')?.textContent || '';
    return { Coins, rate, earned, peers, eur, usd };
  },

  _css() {
    if (document.getElementById('resource-monitor-css')) return;
    const st = document.createElement('style');
    st.id = 'resource-monitor-css';
    st.textContent = [
      '#cosmic-guide{display:none!important}',
      /* Standalone fuse (before field-hud) */
      '#resource-monitor.rm-standalone{position:fixed;top:max(8px, env(safe-area-inset-top));right:8px;',
      'z-index:90;width:min(200px,48vw);padding:10px 11px;border-radius:12px;',
      'background:rgba(0,8,20,0.88);border:1px solid rgba(0,221,119,0.38);',
      'box-shadow:0 0 16px rgba(0,221,119,0.18),0 8px 24px rgba(0,0,0,0.45);',
      'font:10px/1.3 system-ui,sans-serif;color:#c8e4ff;backdrop-filter:blur(12px);',
      'touch-action:manipulation;user-select:none;text-align:right}',
      /* Fused inside money field */
      '#field-balance-hud #rm-fuse{margin-top:6px;padding-top:6px;border-top:1px solid rgba(0,221,119,0.22);text-align:right}',
      '#field-balance-hud{z-index:90!important}',
      '#rm-fuse .rm-bar-wrap{position:relative;height:10px;border-radius:999px;margin:4px 0 6px;',
      'background:rgba(0,20,40,0.75);border:1px solid rgba(61,158,255,0.28);overflow:hidden}',
      '#rm-fuse .rm-bar-app{position:absolute;left:0;top:0;bottom:0;width:0%;',
      'background:linear-gradient(90deg,#a33,#ff6644);box-shadow:0 0 6px rgba(255,100,60,0.4);transition:width .2s}',
      '#rm-fuse .rm-bar-donate{position:absolute;top:0;bottom:0;width:0%;',
      'background:linear-gradient(90deg,#0a6a8a,#3d9eff);box-shadow:0 0 6px rgba(61,158,255,0.35);transition:left .2s,width .2s}',
      '#rm-fuse .rm-bar-cap{position:absolute;top:-2px;bottom:-2px;width:2px;background:#ffdd44;',
      'box-shadow:0 0 6px #ffdd44;pointer-events:none}',
      '#rm-fuse .rm-meta{display:flex;justify-content:space-between;gap:6px;font-size:8px;color:#7a9aaa;margin-bottom:4px}',
      '#rm-fuse .rm-meta b{color:#a8d4ff;font-weight:700}',
      '#rm-fuse .rm-meta .rm-Coins-mini{color:#00ffaa;font-weight:800;font-size:10px}',
      '#rm-fuse .rm-master label{display:flex;justify-content:space-between;font-size:9px;color:#8ab;margin-bottom:2px}',
      '#rm-fuse .rm-master label span{color:#ffdd66;font-weight:700}',
      '#rm-fuse .rm-master input[type=range]{width:100%;height:16px;margin:0;appearance:none;-webkit-appearance:none;',
      'background:transparent;cursor:pointer}',
      '#rm-fuse .rm-master input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:999px;',
      'background:linear-gradient(90deg,rgba(255,220,68,0.25),rgba(0,221,119,0.35))}',
      '#rm-fuse .rm-master input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;margin-top:-5px;',
      'border-radius:50%;background:#fff;border:2px solid #ffdd44;box-shadow:0 0 8px rgba(255,220,68,0.7)}',
      '#rm-fuse .rm-foot{font-size:8px;color:#678;margin-top:4px;line-height:1.3}',
      '#rm-fuse .rm-foot.warn{color:#ff8866}',
      '#rm-fuse .rm-tog-row{display:flex;justify-content:flex-end;gap:4px;margin-top:4px}',
      '#rm-fuse .rm-tog{background:transparent;border:1px solid #456;color:#9ab;border-radius:8px;padding:2px 7px;cursor:pointer;font-size:9px}',
      '#rm-fuse.rm-collapsed .rm-body{display:none}',
      '#rm-fuse.rm-collapsed .rm-bar-wrap{margin-bottom:0}',
      /* Hide left-rail leftovers */
      '#resource-monitor:not(.rm-standalone){display:none!important}',
      '@media (max-width:420px){#resource-monitor.rm-standalone{width:min(168px,52vw);padding:8px}}',
    ].join('');
    document.head.appendChild(st);
  },

  _fuseHtml(includeMoney) {
    return [
      '<div id="rm-fuse" class="rm-collapsed" role="region" aria-label="Money and max resource">',
      includeMoney
        ? '<div class="rm-meta"><span class="rm-Coins-mini" id="rm-Coins">— Coins</span><span id="rm-earn-mini">⛏ —</span></div>'
        : '',
      '<div class="rm-meta"><span>You <b id="rm-app-pct">—</b></span><span>Spare <b id="rm-spare-pct">—</b></span><span>Cap <b id="rm-max-pct">80%</b></span></div>',
      '<div class="rm-bar-wrap" title="Red = your app · Blue = idle donate · Yellow mark = max total">',
      '<div class="rm-bar-app" id="rm-bar-app"></div>',
      '<div class="rm-bar-donate" id="rm-bar-donate"></div>',
      '<div class="rm-bar-cap" id="rm-bar-cap"></div>',
      '</div>',
      '<div class="rm-body">',
      '<div class="rm-master">',
      '<label>Max total (idle) <span id="rm-max-val">80%</span></label>',
      '<input type="range" id="rm-max-total" min="15" max="100" value="80" ',
      'title="Universal max for your use + donate on this device and fleet when idling" />',
      '</div>',
      '<div class="rm-foot" id="rm-foot">Includes your own use · idle donate only uses spare under the cap</div>',
      '</div>',
      '<div class="rm-tog-row"><button type="button" class="rm-tog" id="rm-expand" aria-expanded="false">Max ▾</button></div>',
      '</div>',
    ].join('');
  },

  _inject() {
    this._css();
    // Kill cosmic essay rail
    const cg = document.getElementById('cosmic-guide');
    if (cg) { cg.hidden = true; cg.style.display = 'none'; cg.innerHTML = ''; }

    const fbh = document.getElementById('field-balance-hud');
    if (fbh) {
      this._mountInto(fbh);
      return;
    }
    // Standalone top-right until FieldHud arrives
    if (document.getElementById('resource-monitor')) return;
    const el = document.createElement('div');
    el.id = 'resource-monitor';
    el.className = 'rm-standalone';
    el.innerHTML = this._fuseHtml(true);
    document.body.appendChild(el);
    this._host = el;
  },

  _mountInto(fbh) {
    if (!fbh || fbh.querySelector('#rm-fuse')) {
      this._host = fbh;
      return;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = this._fuseHtml(false);
    fbh.appendChild(wrap.firstChild);
    // Soften field-hud's own resource grid — fused bar replaces it visually
    const res = fbh.querySelector('.fbh-resources');
    if (res) res.style.display = 'none';
    this._host = fbh;
    // Drop standalone if present
    document.getElementById('resource-monitor')?.remove();
  },

  _bind() {
    this._listenFleetCap();
    const expand = document.getElementById('rm-expand');
    const slider = document.getElementById('rm-max-total');
    if (expand && !expand._rmBound) {
      expand._rmBound = true;
      expand.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleExpand();
      });
    }
    if (slider && !slider._rmBound) {
      slider._rmBound = true;
      // Don't open miner panel when dragging the slider
      slider.addEventListener('click', (e) => e.stopPropagation());
      slider.addEventListener('pointerdown', (e) => e.stopPropagation());
      slider.addEventListener('input', (e) => {
        e.stopPropagation();
        const n = this.setMaxTotal((Number(e.target.value) || 80) / 100);
        this.refresh(true);
        CliRibbon?.setNotice?.(
          'Max total ' + Math.round(n * 100) + '% · own + idle donate · device & fleet',
          'ready'
        );
      });
      slider.addEventListener('change', (e) => e.stopPropagation());
    }
    // Expand on bar tap without opening miner (stop bubble only on fuse controls)
    const fuse = document.getElementById('rm-fuse');
    if (fuse && !fuse._rmBound) {
      fuse._rmBound = true;
      fuse.addEventListener('click', (e) => {
        if (e.target.closest('input,button,.rm-master,.rm-body')) {
          e.stopPropagation();
        }
      });
    }
  },

  toggleExpand() {
    const fuse = document.getElementById('rm-fuse');
    if (!fuse) return;
    this._collapsed = !this._collapsed;
    fuse.classList.toggle('rm-collapsed', this._collapsed);
    const b = document.getElementById('rm-expand');
    if (b) {
      b.textContent = this._collapsed ? 'Max ▾' : 'Max ▴';
      b.setAttribute('aria-expanded', this._collapsed ? 'false' : 'true');
    }
  },

  refresh(force) {
    const fuse = document.getElementById('rm-fuse');
    if (!fuse) return;

    const cg = document.getElementById('cosmic-guide');
    if (cg && cg.style.display !== 'none') {
      cg.innerHTML = '';
      cg.style.display = 'none';
      cg.hidden = true;
    }

    const own = this.appLoad();
    const cap = this.maxTotal();
    const spare = this.idleDonateBudget();
    const money = this.moneySnapshot();

    const setTxt = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    setTxt('rm-app-pct', Math.round(own * 100) + '%');
    setTxt('rm-spare-pct', Math.round(spare * 100) + '%');
    setTxt('rm-max-pct', Math.round(cap * 100) + '%');
    setTxt('rm-max-val', Math.round(cap * 100) + '%');
    setTxt('rm-Coins', money.Coins);
    setTxt('rm-earn-mini', '⛏ ' + money.rate + ' · ' + money.earned);

    const appBar = document.getElementById('rm-bar-app');
    const donBar = document.getElementById('rm-bar-donate');
    const capMark = document.getElementById('rm-bar-cap');
    if (appBar) appBar.style.width = (own * 100) + '%';
    if (donBar) {
      donBar.style.left = (own * 100) + '%';
      donBar.style.width = (spare * 100) + '%';
    }
    if (capMark) capMark.style.left = 'calc(' + (cap * 100) + '% - 1px)';

    const slider = document.getElementById('rm-max-total');
    if (slider && (force || document.activeElement !== slider)) {
      slider.value = String(Math.round(cap * 100));
    }

    // Mirror into field-hud mini stats if still visible
    setTxt('fbh-cpu', Math.round(own * 100) + '%');
    setTxt('fbh-ram', Math.round(cap * 100) + '% max');
    setTxt('fbh-storage', Math.round(spare * 100) + '% spare');
    setTxt('fbh-bw', 'idle only');

    const foot = document.getElementById('rm-foot');
    if (foot) {
      const over = own > cap + 0.02;
      foot.classList.toggle('warn', over);
      foot.textContent = over
        ? 'Over cap — close heavy views or raise Max total'
        : 'Max total includes your own use · idle donate uses only spare · device + fleet';
    }

    window._resourceMaxOccupy = cap;
    window._resourceMaxTotal = cap;
  },

  wants(text) {
    return /\b(resource|resources|donate|monitor|max\s*(load|total)|fleet\s*cap)\b/i.test(String(text || ''));
  },

  handleCli(line) {
    const low = String(line || '').toLowerCase();
    this.init();
    const m = low.match(/(?:max|cap)\s*(\d{1,3})\s*%?/);
    if (m) {
      const n = this.setMaxTotal(parseInt(m[1], 10) / 100);
      this.refresh(true);
      return 'Max total set to ' + Math.round(n * 100) + '% (own + idle donate · device & fleet)';
    }
    if (/expand|open|show/.test(low)) {
      this._collapsed = true;
      this.toggleExpand();
      return 'Resource max open · top right';
    }
    if (/hide|close|collapse/.test(low)) {
      this._collapsed = false;
      this.toggleExpand();
      return 'Resource panel collapsed';
    }
    AciCli?.print?.(
      'own ' + Math.round(this.appLoad() * 100) + '% · max ' + Math.round(this.maxTotal() * 100)
      + '% · spare ' + Math.round(this.idleDonateBudget() * 100) + '% · fleet cap shared',
      'ok'
    );
    return 'Universal max · top-right money field';
  },
};
window.ResourceMonitor = ResourceMonitor;
