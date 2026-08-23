// === SLUMBER MANAGER — probe hardware, sleep/wake subsystems, scale quality ===
const SlumberManager = {
  tier: 'balanced',
  _inited: false,
  _fpsSamples: [],
  _lastFrame: 0,
  _monitor: null,
  _userPinned: false,

  TIER_LABEL: {
    gaming: 'Gaming',
    full: 'Full power',
    balanced: 'Balanced',
    conserve: 'Conserve',
    slumber: 'Slumber',
  },

  PRESETS: {
    gaming: {
      pixelRatio: 2.0,
      earthHd: true,
      earthTickMs: 180,
      entityTickMs: 160,
      newsIntervalMs: 12000,
      newsMax: 8,
      cityMaxZoom: 20,
      cityDriverMs: 4000,
      deferredDelayMs: 400,
      anim: { orbital: 2, entity: 4, earth: 2, celestial: 2, cosmic: 6 },
      codersPing: true,
      labOrbs: true,
      presence: true,
      gamingGraphics: true,
    },
    full: {
      pixelRatio: 1.25,
      earthHd: true,
      earthTickMs: 250,
      entityTickMs: 200,
      newsIntervalMs: 12000,
      newsMax: 8,
      cityMaxZoom: 20,
      cityDriverMs: 4500,
      deferredDelayMs: 600,
      anim: { orbital: 3, entity: 6, earth: 4, celestial: 3, cosmic: 8 },
      codersPing: true,
      labOrbs: true,
      presence: true,
    },
    balanced: {
      pixelRatio: 1.0,
      earthHd: true,
      earthTickMs: 400,
      entityTickMs: 320,
      newsIntervalMs: 20000,
      newsMax: 5,
      cityMaxZoom: 18,
      cityDriverMs: 7000,
      deferredDelayMs: 1400,
      anim: { orbital: 4, entity: 8, earth: 6, celestial: 6, cosmic: 10 },
      codersPing: true,
      labOrbs: true,
      presence: true,
    },
    conserve: {
      pixelRatio: 0.9,
      earthHd: false,
      earthTickMs: 650,
      entityTickMs: 520,
      newsIntervalMs: 45000,
      newsMax: 3,
      cityMaxZoom: 16,
      cityDriverMs: 12000,
      deferredDelayMs: 3200,
      anim: { orbital: 6, entity: 12, earth: 8, celestial: 12, cosmic: 16 },
      codersPing: false,
      labOrbs: false,
      presence: false,
    },
    slumber: {
      pixelRatio: 0.75,
      earthHd: false,
      earthTickMs: 900,
      entityTickMs: 780,
      newsIntervalMs: 0,
      newsMax: 0,
      cityMaxZoom: 15,
      cityDriverMs: 18000,
      deferredDelayMs: 6000,
      anim: { orbital: 9, entity: 18, earth: 12, celestial: 18, cosmic: 24 },
      codersPing: false,
      labOrbs: false,
      presence: false,
    },
  },

  SUBSYSTEMS: {
    globe: { label: 'Earth globe', essential: true },
    grok: { label: 'Grok voice/text', essential: true },
    cli: { label: 'Command line', essential: true },
    earth_hd: { label: 'HD earth textures' },
    deferred: { label: 'Shops · coders · comms pack' },
    news: { label: 'News ticker' },
    coders_ping: { label: 'Coders lab health checks' },
    lab_orbs: { label: 'Lab quick-orbs' },
    presence: { label: 'Live presence on map' },
    entities: { label: 'Globe entity labels' },
    commerce: { label: 'Shops & delivery' },
    celestial: { label: 'Constellation overlay' },
    city_hd: { label: 'City satellite tiles' },
    webrtc: { label: 'Voice/video calls' },
    voice: { label: 'Hands-free voice' },
  },

  init() {
    if (this._inited) return;
    this._inited = true;
    this.profile = this.probeHardware();
    this.states = {};
    Object.keys(this.SUBSYSTEMS).forEach(id => { this.states[id] = 'drowsy'; });
    ['globe', 'grok', 'cli'].forEach(id => { this.states[id] = 'awake'; });
    this.applyTier(this.pickInitialTier(), 'hardware probe');
    this._bind();
    this._startMonitor();
    setTimeout(() => this._announceLimits(), 1800);
  },

  probeHardware() {
    const nav = navigator;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    const mem = nav.deviceMemory || 0;
    const cores = nav.hardwareConcurrency || 2;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '')
      || (nav.maxTouchPoints > 1 && window.innerWidth < 900);
    let gpu = '';
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      if (dbg && gl) gpu = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '';
    } catch (_) {}
    const saveData = !!(conn?.saveData);
    const effectiveType = conn?.effectiveType || '';
    const lowEndGpu = /swiftshader|llvmpipe|intel hd [2-4]|mali-[34]|adreno [23]/i.test(gpu);
    return {
      cores,
      memoryGb: mem,
      mobile,
      gpu: gpu.slice(0, 80),
      lowEndGpu,
      saveData,
      connection: effectiveType,
      slowNet: saveData || effectiveType === 'slow-2g' || effectiveType === '2g',
      width: window.innerWidth,
      height: window.innerHeight,
    };
  },

  pickInitialTier() {
    const p = this.profile;
    // Phone = conserve by default (responsiveness > cinema)
    if (p.mobile || window._globePerfLite) {
      if (p.lowEndGpu || p.slowNet || p.saveData || p.cores <= 4) return 'slumber';
      return 'conserve';
    }
    let score = 0;
    if (p.cores >= 8) score += 2;
    else if (p.cores >= 4) score += 1;
    if (p.memoryGb >= 8) score += 2;
    else if (p.memoryGb >= 4) score += 1;
    if (!p.mobile) score += 1;
    if (p.lowEndGpu) score -= 2;
    if (p.slowNet) score -= 2;
    if (p.saveData) score -= 2;
    if (p.width < 380) score -= 1;
    if (score >= 6) return 'gaming';
    if (score >= 4) return 'full';
    if (score >= 2) return 'balanced';
    if (score >= 0) return 'conserve';
    return 'slumber';
  },

  applyTier(tier, reason) {
    if (!this.PRESETS[tier]) tier = 'balanced';
    this.tier = tier;
    this.quality = { ...this.PRESETS[tier] };
    window._globePerfLite = tier !== 'full' && tier !== 'gaming';
    window._slumberTier = tier;
    document.body.dataset.slumber = tier;
    this._applySubsystemDefaults(tier);
    this.applyQuality();
    if (reason && reason !== 'hardware probe') this.notify(`Slumber · ${this.TIER_LABEL[tier]} — ${reason}`);
  },

  _applySubsystemDefaults(tier) {
    const q = this.quality;
    const set = (id, state) => { if (this.SUBSYSTEMS[id]) this.states[id] = state; };
    set('globe', 'awake');
    set('grok', 'awake');
    set('cli', 'awake');
    set('earth_hd', q.earthHd ? (tier === 'full' || tier === 'gaming' ? 'awake' : 'drowsy') : 'sleeping');
    set('deferred', tier === 'slumber' ? 'sleeping' : tier === 'conserve' ? 'drowsy' : 'awake');
    set('news', q.newsMax > 0 ? (tier === 'full' ? 'awake' : 'drowsy') : 'sleeping');
    set('coders_ping', q.codersPing ? 'drowsy' : 'sleeping');
    set('lab_orbs', q.labOrbs ? 'drowsy' : 'sleeping');
    set('presence', q.presence ? 'drowsy' : 'sleeping');
    set('entities', tier === 'slumber' ? 'drowsy' : 'awake');
    set('commerce', 'sleeping');
    set('celestial', tier === 'full' || tier === 'balanced' ? 'drowsy' : 'sleeping');
    set('city_hd', 'sleeping');
    set('webrtc', 'sleeping');
    set('voice', 'drowsy');
  },

  applyQuality() {
    const q = this.quality;
    if (window.renderer?.setPixelRatio) {
      const dpr = window.devicePixelRatio || 1;
      window.renderer.setPixelRatio(Math.min(dpr, q.pixelRatio));
    }
    if (window.EarthRealism?._inited) window.EarthRealism.tick?.();
    if (window.CityMap?.map && q.cityMaxZoom) {
      try { window.CityMap.map.setMaxZoom(q.cityMaxZoom); } catch (_) {}
    }
  },

  wake(id, reason) {
    if (!this.SUBSYSTEMS[id]) return;
    const prev = this.states[id];
    if (prev === 'awake') return;
    this.states[id] = 'awake';
    if (id === 'deferred') LazyModules?.ensure?.();
    if (id === 'news' && window.NewsFeed?.fetch) window.NewsFeed.fetch();
    if (id === 'commerce' && window.Commerce?.loadVendors) {
      window.Commerce.loadVendors().then(() => window.Commerce?.initUI?.()).catch(() => {});
    }
    if (id === 'coders_ping' && window.CodersHub?._pingLabs) window.CodersHub._pingLabs();
    if (id === 'lab_orbs' && window.LabOrbs?.init) window.LabOrbs.init();
    if (id === 'presence' && window.AstranovPresence?.join) window.AstranovPresence.join();
    if (id === 'city_hd' && window.CityMap?.active) window.CityMap._invalidate?.();
    if (reason && prev === 'sleeping') this.notify(`Awake · ${this.SUBSYSTEMS[id].label}`, 'ready');
  },

  sleep(id, reason) {
    if (!this.SUBSYSTEMS[id] || this.SUBSYSTEMS[id].essential) return;
    if (this.states[id] === 'sleeping') return;
    this.states[id] = 'sleeping';
    if (id === 'news') {
      const preview = document.getElementById('globe-deck-preview');
      if (preview && /📰|news/i.test(preview.textContent || '')) preview.textContent = '';
    }
    if (id === 'coders_ping' && document.getElementById('coders-hub-trigger')) {
      delete document.getElementById('coders-hub-trigger').dataset.pinging;
    }
    if (id === 'lab_orbs') document.getElementById('lab-orb-layer')?.classList.remove('open', 'intro');
    if (id === 'presence' && window.AstranovPresence?.leave) window.AstranovPresence.leave();
    if (reason) this.notify(`Sleep · ${this.SUBSYSTEMS[id].label}`, 'hold');
  },

  isAwake(id) {
    return this.states[id] === 'awake';
  },

  allows(id) {
    const s = this.states[id];
    return s === 'awake' || s === 'drowsy';
  },

  shouldInit(id) {
    return this.allows(id);
  },

  frameDivisor(kind) {
    return this.quality?.anim?.[kind] || 6;
  },

  tickMs(kind) {
    const q = this.quality || {};
    if (kind === 'earth') return q.earthTickMs || 400;
    if (kind === 'entity') return q.entityTickMs || 320;
    if (kind === 'news') return q.newsIntervalMs || 20000;
    if (kind === 'cityDriver') return q.cityDriverMs || 7000;
    return 500;
  },

  deferredDelay() {
    return this.quality?.deferredDelayMs || 1400;
  },

  wakeForAction(action) {
    const act = String(action || '').toLowerCase();
    const map = {
      order: ['commerce', 'deferred', 'entities'],
      commerce: ['commerce', 'deferred', 'entities'],
      batch: ['deferred', 'presence'],
      vhf: ['deferred', 'webrtc'],
      radio: ['deferred', 'webrtc'],
      pmr: ['deferred', 'webrtc'],
      phone: ['deferred', 'webrtc'],
      call: ['deferred', 'webrtc'],
      news: ['news', 'deferred'],
      drive: ['deferred', 'city_hd'],
      city: ['city_hd'],
      map: ['city_hd'],
      coders: ['deferred', 'coders_ping'],
      add: ['deferred'],
      post: ['deferred'],
      superadd: ['deferred'],
      locate: ['entities'],
    };
    (map[act] || []).forEach(id => this.wake(id, act));
    if (['order', 'commerce', 'batch', 'vhf', 'radio', 'news', 'drive', 'coders', 'add'].includes(act)) {
      this.wake('voice', act);
    }
  },

  tickFrame() {
    const now = performance.now();
    if (this._lastFrame) {
      const dt = now - this._lastFrame;
      if (dt > 0 && dt < 200) {
        this._fpsSamples.push(1000 / dt);
        if (this._fpsSamples.length > 48) this._fpsSamples.shift();
      }
    }
    this._lastFrame = now;
    if (this._fpsSamples.length >= 24 && !this._userPinned) this._maybeDowngrade();
  },

  _avgFps() {
    if (!this._fpsSamples.length) return 60;
    return this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length;
  },

  _maybeDowngrade() {
    const fps = this._avgFps();
    const order = ['full', 'balanced', 'conserve', 'slumber'];
    const idx = order.indexOf(this.tier);
    if (fps < 22 && idx < order.length - 1) {
      this.applyTier(order[idx + 1], `FPS ${fps.toFixed(0)} — easing load`);
      this._fpsSamples = [];
    }
  },

  _bind() {
    document.addEventListener('visibilitychange', () => this._onVisibility());
    window.addEventListener('resize', () => {
      clearTimeout(this._resizeT);
      this._resizeT = setTimeout(() => this.applyQuality(), 200);
    });
  },

  _onVisibility() {
    if (document.hidden) {
      this.sleep('news', 'tab hidden');
      this.sleep('coders_ping', 'tab hidden');
      this.sleep('lab_orbs', 'tab hidden');
      this.sleep('presence', 'tab hidden');
      this.sleep('celestial', 'tab hidden');
    } else {
      if (this.quality.newsMax > 0) this.wake('news', 'tab visible');
      if (this.quality.codersPing) this.wake('coders_ping', 'tab visible');
      if (this.quality.labOrbs) this.wake('lab_orbs', 'tab visible');
      if (this.quality.presence && Auth?.user) this.wake('presence', 'tab visible');
      if (this.tier === 'full' || this.tier === 'balanced') this.wake('celestial', 'tab visible');
    }
  },

  _startMonitor() {
    clearInterval(this._monitor);
    this._monitor = setInterval(() => this._idleSweep(), 30000);
  },

  _idleSweep() {
    if (document.hidden) return;
    const task = GlobeDeck?.activeTask;
    const voice = window._handsFreeVoice || isListening;
    if (!voice && task !== 'commerce') this.sleep('commerce', 'idle');
    if (!voice && task !== 'radio') this.sleep('webrtc', 'idle');
    if (!CityMap?.active) this.sleep('city_hd', 'idle');
    if (!voice && !GlobeDeck?.thinking) this.sleep('voice', 'idle');
  },

  _limitsText() {
    const p = this.profile;
    const parts = [this.TIER_LABEL[this.tier]];
    if (p.mobile) parts.push('mobile');
    if (p.cores) parts.push(p.cores + ' cores');
    if (p.memoryGb) parts.push(p.memoryGb + 'GB RAM');
    if (p.slowNet) parts.push('slow net');
    if (p.lowEndGpu) parts.push('basic GPU');
    if (!this.quality.earthHd) parts.push('SD earth');
    if (!this.quality.newsMax) parts.push('news off');
    else if (this.quality.newsMax < 8) parts.push('news×' + this.quality.newsMax);
    const sleeping = Object.entries(this.states).filter(([, s]) => s === 'sleeping').map(([id]) => this.SUBSYSTEMS[id]?.label).filter(Boolean);
    if (sleeping.length) parts.push('sleeping: ' + sleeping.slice(0, 3).join(', '));
    return parts.join(' · ');
  },

  _announceLimits() {
    const line = this._limitsText();
    this.notify(line, 'info');
    const zl = document.getElementById('zoom-label');
    if (zl && this.tier !== 'full') {
      zl.title = 'Slumber ' + this.tier + ' — ' + line;
    }
    ACIControl?.reply?.('Slumber · ' + line + ' · say "slumber status" or "wake shops"');
  },

  notify(text, kind) {
    CliRibbon?.setNotice?.(String(text || '').slice(0, 120), kind || 'info');
  },

  statusReport() {
    const awake = [];
    const sleeping = [];
    Object.entries(this.states).forEach(([id, s]) => {
      const label = this.SUBSYSTEMS[id]?.label || id;
      if (s === 'sleeping') sleeping.push(label);
      else awake.push(label + (s === 'drowsy' ? '↓' : ''));
    });
    return {
      tier: this.tier,
      label: this.TIER_LABEL[this.tier],
      fps: this._avgFps().toFixed(0),
      profile: this.profile,
      quality: this.quality,
      awake,
      sleeping,
      line: this._limitsText(),
    };
  },

  async cli(parts) {
    const cmd = String(parts?.[0] || 'status').toLowerCase();
    if (cmd === 'status' || cmd === 'info' || cmd === 'limits') {
      const r = this.statusReport();
      AciCli?.print?.('Slumber · ' + r.line, 'ok');
      AciCli?.print?.('Awake: ' + r.awake.join(', '), 'dim');
      if (r.sleeping.length) AciCli?.print?.('Sleeping: ' + r.sleeping.join(', '), 'dim');
      AciCli?.print?.('FPS ~' + r.fps + ' · tier ' + r.tier, 'dim');
      this.notify(r.line);
      return r;
    }
    if (cmd === 'wake' && parts[1]) {
      const key = parts[1].toLowerCase();
      const id = Object.keys(this.SUBSYSTEMS).find(k => k.includes(key) || this.SUBSYSTEMS[k].label.toLowerCase().includes(key));
      if (id) { this.wake(id, 'user'); AciCli?.print?.('Awake · ' + this.SUBSYSTEMS[id].label, 'ok'); }
      else AciCli?.print?.('Unknown subsystem — try shops, news, coders, presence', 'err');
      return;
    }
    if (cmd === 'sleep' && parts[1]) {
      const key = parts[1].toLowerCase();
      const id = Object.keys(this.SUBSYSTEMS).find(k => k.includes(key) || this.SUBSYSTEMS[k].label.toLowerCase().includes(key));
      if (id) { this.sleep(id, 'user'); AciCli?.print?.('Sleep · ' + this.SUBSYSTEMS[id].label, 'ok'); }
      return;
    }
    if (['full', 'balanced', 'conserve', 'slumber'].includes(cmd)) {
      this._userPinned = true;
      this.applyTier(cmd, 'you asked');
      const r = this.statusReport();
      AciCli?.print?.('Slumber mode · ' + r.label, 'ok');
      return r;
    }
    if (cmd === 'auto') {
      this._userPinned = false;
      this.applyTier(this.pickInitialTier(), 'auto');
      AciCli?.print?.('Slumber auto · ' + this.TIER_LABEL[this.tier], 'ok');
      return;
    }
    AciCli?.print?.('slumber status | wake shops | sleep news | balanced | conserve | slumber | auto', 'dim');
  },
};
window.SlumberManager = SlumberManager;
// Defer heavy probe (extra WebGL context) until after first globe frames
if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(() => { try { SlumberManager.init(); } catch (_) {} }, { timeout: 3500 });
} else {
  setTimeout(() => { try { SlumberManager.init(); } catch (_) {} }, 1200);
}
