// === FIELD HUD — top-right balances/mining · left radar · center speed ===
// AI HANDOFF: see astranov-continuity.js → features.minerRig, spaceNetFinance, fieldHudRadar.
// Tap #field-balance-hud → #spacenet-finance-panel multi-tile (stats · mining · 3% invoices · P2P · reports).
// NO #aci-miner CLI strip. Radar throttled. SpaceNetMiner prefs astranov:miner-rig-prefs.
const SpaceNetMiner = {
  TERMS_KEY: 'astranov:spacenet-miner-v2',
  SESSION_KEY: 'astranov:spacenet-miner-session',
  CHANNEL: 'astranov-spacenet-mesh-v1',
  BASE_RATE: 0.014,
  SLEEP_MULT: 2.4,
  PEER_BONUS: 0.003,
  RESOURCES: ['cpu', 'ram', 'storage', 'bandwidth'],
  WORK_TYPES: ['route_cache', 'mesh_relay', 'brain_shard', 'vendor_index', 'presence_sync'],
  _peers: new Map(),
  _peerCount: 0,
  _channel: null,
  _nodeId: null,
  _caps: null,
  _contrib: { cpu: 0, ram: 0, storage: 0, bandwidth: 0 },
  _rates: { cpu: 0, ram: 0, storage: 0, bandwidth: 0 },
  _sessionEarned: 0,
  _mineRate: 0,
  _termsOk: false,
  _workQueue: [],
  _lastWorkAt: 0,

  nodeId() {
    if (this._nodeId) return this._nodeId;
    try {
      let id = localStorage.getItem('astranov:miner-node-id');
      if (!id) {
        id = 'sn-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        localStorage.setItem('astranov:miner-node-id', id);
      }
      this._nodeId = id;
    } catch (_) {
      this._nodeId = 'sn-' + Date.now().toString(36);
    }
    return this._nodeId;
  },

  detectCaps() {
    const cores = navigator.hardwareConcurrency || 4;
    const ramGb = navigator.deviceMemory || 4;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const downMbps = conn?.downlink || 10;
    let storageMb = 256;
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then(e => {
        if (e.quota) this._caps.storageMb = Math.min(2048, Math.round(e.quota / 1048576 * 0.08));
      }).catch(() => {});
    }
    this._caps = {
      cores,
      ramMb: Math.round(ramGb * 1024 * 0.12),
      storageMb,
      bandwidthKbps: Math.round(downMbps * 1024 * 0.06),
    };
    return this._caps;
  },

  initMesh() {
    if (this._channel || typeof BroadcastChannel === 'undefined') return;
    try {
      this._channel = new BroadcastChannel(this.CHANNEL);
      this._channel.onmessage = (ev) => this.onMeshMessage(ev.data);
      this.announce();
      if (this._meshPing) clearInterval(this._meshPing);
      this._meshPing = setInterval(() => this.announce(), 12000);
    } catch (_) {}
    this.syncNodePeers();
  },

  announce() {
    if (!this._channel) return;
    this._channel.postMessage({
      type: 'presence',
      id: this.nodeId(),
      at: Date.now(),
      caps: this._caps,
      contrib: this._contrib,
    });
  },

  onMeshMessage(msg) {
    if (!msg || msg.id === this.nodeId()) return;
    if (msg.type === 'presence') {
      this._peers.set(msg.id, { at: msg.at, caps: msg.caps, contrib: msg.contrib });
      this.prunePeers();
      this._peerCount = this._peers.size;
      return;
    }
    if (msg.type === 'work_offer' && this.canAcceptWork()) {
      this._workQueue.push(msg.unit);
      if (this._workQueue.length > 8) this._workQueue.shift();
    }
    if (msg.type === 'work_done' && msg.unitId) {
      FieldHud?.onPeerWorkDone?.(msg);
    }
  },

  prunePeers() {
    const cutoff = Date.now() - 25000;
    this._peers.forEach((p, id) => { if (p.at < cutoff) this._peers.delete(id); });
    this._peerCount = this._peers.size;
  },

  syncNodePeers() {
    const node = window.AstranovNode;
    if (node?.peerCount > 0) {
      this._peerCount = Math.max(this._peerCount, node.peerCount);
    }
  },

  canAcceptWork() {
    if (!this._termsOk || FieldHud.deviceLoad() >= 0.65) return false;
    const prefs = FieldHud?._minerPrefs?.() || {};
    return ['cpu', 'ram', 'storage', 'bandwidth'].some(k => prefs[k] !== false);
  },

  offerWork() {
    if (!this._channel || !this.canAcceptWork()) return;
    const unit = {
      id: 'wu-' + Date.now().toString(36),
      type: this.WORK_TYPES[Math.floor(Math.random() * this.WORK_TYPES.length)],
      shard: Math.random().toString(36).slice(2, 14),
      from: this.nodeId(),
    };
    this._channel.postMessage({ type: 'work_offer', unit });
    return unit;
  },

  async processWork(dt) {
    if (!this._termsOk || !this.canAcceptWork()) return;
    const load = FieldHud.deviceLoad();
    const budget = Math.max(0, 1 - load);
    if (budget < 0.15) return;

    const unit = this._workQueue.shift() || this.offerWork();
    if (!unit) return;

    const type = unit.type || 'mesh_relay';
    let earned = 0;
    if (type === 'route_cache' || type === 'brain_shard') {
      earned += this.tickCpu(budget, dt);
    } else if (type === 'vendor_index') {
      earned += await this.tickStorage(budget);
    } else if (type === 'presence_sync' || type === 'mesh_relay') {
      earned += await this.tickBandwidth(budget);
    }
    earned += this.tickRam(budget);
    this._lastWorkAt = Date.now();

    if (this._channel && unit.id) {
      this._channel.postMessage({ type: 'work_done', unitId: unit.id, from: this.nodeId(), earned });
    }
    return earned;
  },

  tickCpu(budget, dt) {
    const cores = this._caps?.cores || 4;
    const ops = Math.floor(8000 * budget * (cores / 8) * Math.min(dt / 500, 1));
    let h = 0;
    for (let i = 0; i < ops; i++) h = ((h << 5) - h + i) | 0;
    const pct = Math.min(100, Math.round(budget * cores * 8));
    this._contrib.cpu += ops / 10000;
    this._rates.cpu = pct;
    return ops / 1200000;
  },

  tickRam(budget) {
    const mb = Math.round((this._caps?.ramMb || 512) * budget * 0.15);
    this._contrib.ram += mb * 0.001;
    this._rates.ram = mb;
    return mb / 80000;
  },

  async tickStorage(budget) {
    const mb = Math.round((this._caps?.storageMb || 128) * budget * 0.02);
    try {
      const key = 'sn-shard-' + (Date.now() % 1000);
      const blob = JSON.stringify({ shard: key, routes: Math.floor(Math.random() * 40), at: Date.now() });
      localStorage.setItem(key, blob);
      if (Math.random() < 0.08) {
        Object.keys(localStorage).filter(k => k.startsWith('sn-shard-')).slice(0, 3)
          .forEach(k => localStorage.removeItem(k));
      }
    } catch (_) {}
    this._contrib.storage += mb * 0.01;
    this._rates.storage = mb;
    return mb / 60000;
  },

  async tickBandwidth(budget) {
    const kb = Math.round((this._caps?.bandwidthKbps || 512) * budget * 0.04);
    this._contrib.bandwidth += kb * 0.01;
    this._rates.bandwidth = kb;
    if (budget > 0.4 && kb > 20) {
      try {
        await fetch('/coders-labs.json', { cache: 'force-cache' });
      } catch (_) {}
    }
    return kb / 90000;
  },

  computeRate() {
    if (!this._termsOk) return 0;
    const prefs = FieldHud?._minerPrefs?.() || {};
    const anyRes = ['cpu', 'ram', 'storage', 'bandwidth'].some(k => prefs[k] !== false);
    if (!anyRes) return 0;
    const load = FieldHud.deviceLoad();
    if (load > 0.7) return 0;
    let rate = this.BASE_RATE * (1 - load);
    let resSum = 0;
    if (prefs.cpu !== false) resSum += this._rates.cpu / 100;
    if (prefs.ram !== false) resSum += this._rates.ram / 512;
    if (prefs.storage !== false) resSum += this._rates.storage / 128;
    if (prefs.bandwidth !== false) resSum += this._rates.bandwidth / 1024;
    rate *= 0.6 + Math.min(1.4, resSum);
    rate += this._peerCount * this.PEER_BONUS;
    if (prefs.sleep !== false && FieldHud.isSleepMode()) rate *= this.SLEEP_MULT;
    else if (load > 0.3) rate *= 0.4;
    return Math.max(0, rate);
  },

  acceptTerms() {
    try { localStorage.setItem(this.TERMS_KEY, String(Date.now())); } catch (_) {}
    this._termsOk = true;
    const m = document.getElementById('miner-terms-modal');
    if (m) m.hidden = true;
    this.initMesh();
    this.announce();
  },

  checkTerms() {
    try { this._termsOk = !!localStorage.getItem(this.TERMS_KEY); } catch (_) {}
    const m = document.getElementById('miner-terms-modal');
    if (m) m.hidden = this._termsOk;
    if (this._termsOk) this.initMesh();
    return this._termsOk;
  },

  loadSession() {
    try {
      const raw = localStorage.getItem(this.SESSION_KEY);
      if (raw) {
        const j = JSON.parse(raw);
        this._sessionEarned = Number(j.earned) || 0;
        if (j.contrib) Object.assign(this._contrib, j.contrib);
      }
    } catch (_) {}
  },

  saveSession() {
    try {
      localStorage.setItem(this.SESSION_KEY, JSON.stringify({
        earned: this._sessionEarned,
        contrib: this._contrib,
        peers: this._peerCount,
        at: Date.now(),
      }));
    } catch (_) {}
  },

  renderHud() {
    const peers = document.getElementById('fbh-peers');
    const cpu = document.getElementById('fbh-cpu');
    const ram = document.getElementById('fbh-ram');
    const sto = document.getElementById('fbh-storage');
    const bw = document.getElementById('fbh-bw');
    const rateEl = document.getElementById('fbh-mine-rate');
    const earnedEl = document.getElementById('fbh-mine-earned');
    const statusEl = document.getElementById('fbh-mine-status');
    if (peers) peers.textContent = this._peerCount + ' peer' + (this._peerCount === 1 ? '' : 's');
    if (cpu) cpu.textContent = this._rates.cpu ? this._rates.cpu + '%' : '—';
    if (ram) ram.textContent = this._rates.ram ? this._rates.ram + 'MB' : '—';
    if (sto) sto.textContent = this._rates.storage ? this._rates.storage + 'MB' : '—';
    if (bw) bw.textContent = this._rates.bandwidth ? this._rates.bandwidth + 'kb/s' : '—';
    if (rateEl) rateEl.textContent = this._mineRate.toFixed(3) + ' AVC/h';
    if (earnedEl) earnedEl.textContent = '+' + this._sessionEarned.toFixed(3);
    if (statusEl) {
      if (!this._termsOk) {
        statusEl.textContent = 'SpaceNet · terms required';
        statusEl.className = 'fbh-status';
      } else if (FieldHud.isSleepMode()) {
        statusEl.textContent = 'P2P sleep rig · mesh idle';
        statusEl.className = 'fbh-status sleep';
      } else if (this._mineRate > 0.005) {
        statusEl.textContent = 'SETI mesh · serving SpaceNet';
        statusEl.className = 'fbh-status active';
      } else {
        statusEl.textContent = 'mesh standby · users serve users';
        statusEl.className = 'fbh-status';
      }
    }
  },

  async tick(dt) {
    if (!this._caps) this.detectCaps();
    this.prunePeers();
    this.syncNodePeers();
    if (this._termsOk && this.canAcceptWork()) {
      const workEarn = await this.processWork(dt);
      if (workEarn) this._sessionEarned += workEarn;
    }
    this._mineRate = this.computeRate();
    if (this._mineRate > 0) {
      this._sessionEarned += this._mineRate * (dt / 3600000);
      this.saveSession();
    }
    this.renderHud();
    FieldHud?.syncMinerChip?.();
    return this._mineRate;
  },
};
window.SpaceNetMiner = SpaceNetMiner;

const FieldHud = {
  TERMS_KEY: SpaceNetMiner.TERMS_KEY,
  MINE_SESSION_KEY: SpaceNetMiner.SESSION_KEY,
  BASE_RATE: SpaceNetMiner.BASE_RATE,
  SLEEP_MULT: SpaceNetMiner.SLEEP_MULT,
  _globeRate: 0,
  _lastGlobeY: null,
  _lastTick: 0,
  _sweepAngle: 0,
  _radarTargetsCache: [],
  _radarTargetsAt: 0,
  SWEEP_PERIOD_MS: 4200,
  EARTH_ROTATION_KMH: 1671,
  EARTH_RADIUS_KM: 6371,
  _sessionEarned: 0,
  _mineRate: 0,
  _mineMode: 'off',
  _audio: null,
  _termsOk: false,

  injectDom() {
    if (!document.getElementById('field-balance-hud')) {
    const bal = document.createElement('div');
    bal.id = 'field-balance-hud';
    bal.setAttribute('aria-live', 'polite');
    bal.setAttribute('role', 'button');
    bal.setAttribute('tabindex', '0');
    bal.setAttribute('title', 'SpaceNet field · tap for miner rig, balances & mesh');
    bal.setAttribute('aria-label', 'SpaceNet field · open miner rig and earnings');
    bal.innerHTML = '<div class="fbh-title">◎ SpaceNet</div>'
      + '<div class="fbh-row fbh-bal"><span id="fbh-avc">— AVC</span></div>'
      + '<div class="fbh-row fbh-fiat"><span id="fbh-eur">€—</span><span id="fbh-usd">$—</span></div>'
      + '<div class="fbh-mesh"><span id="fbh-peers">0 peers</span><span class="fbh-p2p">P2P</span></div>'
      + '<div id="fbh-resources" class="fbh-resources">'
      + '<span>CPU <b id="fbh-cpu">—</b></span>'
      + '<span>RAM <b id="fbh-ram">—</b></span>'
      + '<span>SSD <b id="fbh-storage">—</b></span>'
      + '<span>NET <b id="fbh-bw">—</b></span></div>'
      + '<div class="fbh-mine"><span class="fbh-mine-icon">⛏</span>'
      + '<span id="fbh-mine-rate">0.000/h</span>'
      + '<span id="fbh-mine-earned">+0.00</span></div>'
      + '<div id="fbh-mine-status" class="fbh-status">mesh standby</div>';
    document.body.appendChild(bal);
    }

    if (!document.getElementById('field-radar')) {
    const radar = document.createElement('div');
    radar.id = 'field-radar';
    radar.innerHTML = '<canvas id="field-radar-canvas" width="120" height="120"></canvas>'
      + '<span id="fsh-mode" class="fsh-mode"></span>'
      + '<div id="field-radar-speed" aria-live="polite">'
      + '<span id="fsh-value">0</span>'
      + '<span id="fsh-unit">km/h</span>'
      + '<span id="fsh-limit" hidden></span>'
      + '</div>'
      + '<span class="fr-label">RADAR</span>';
    document.body.appendChild(radar);
    }
    document.getElementById('field-speed-hud')?.remove();

    if (!document.getElementById('miner-terms-modal')) {
    const terms = document.createElement('div');
    terms.id = 'miner-terms-modal';
    terms.hidden = true;
    terms.innerHTML = '<div class="mtm-panel">'
      + '<div class="mtm-title">SpaceNet SETI-style mesh participation</div>'
      + '<p>By using Astranov you join a <b>decentralised peer-to-peer mesh</b> — like SETI@home, '
      + 'but for SpaceNet. Your device shares spare resources to power routing, storage, AI, and comms '
      + 'for every user. <b>Users serve users.</b></p>'
      + '<ul><li><b>CPU</b> — route cache, brain shards, mesh relay compute</li>'
      + '<li><b>RAM</b> — live presence tables and peer coordination</li>'
      + '<li><b>Storage</b> — vendor indexes and offline route shards</li>'
      + '<li><b>Bandwidth</b> — P2P sync between peers when idle</li>'
      + '<li>Resources used <em>only</em> when your device is idle or you sleep — never during active use</li>'
      + '<li>Sleep mode: earth view + space ambient · intelligent miner judges fair AVC share</li></ul>'
      + '<button id="miner-terms-accept" type="button">I agree · join SpaceNet mesh</button>'
      + '</div>';
    document.body.appendChild(terms);
    document.getElementById('miner-terms-accept')?.addEventListener('click', () => SpaceNetMiner.acceptTerms());
    }
  },

  injectCss() {
    if (document.getElementById('field-hud-css')) return;
    const st = document.createElement('style');
    st.id = 'field-hud-css';
    st.textContent = [
      '#aci-avc{display:none!important}',
      '#zoom-tier-dots{display:none!important}',
      '#field-balance-hud{position:fixed;top:10px;right:10px;z-index:42;pointer-events:auto;cursor:pointer;',
      'touch-action:manipulation;font:11px/1.35 ui-monospace,monospace;text-align:right;padding:8px 10px;border-radius:10px;',
      'background:rgba(0,8,20,.62);border:1px solid rgba(0,221,119,.35);',
      'box-shadow:0 0 14px rgba(0,221,119,.2),inset 0 0 20px rgba(0,221,119,.04);',
      'transition:box-shadow .2s,border-color .2s,transform .12s}',
      '#field-balance-hud.mining-active{box-shadow:0 0 18px rgba(0,255,153,.45);border-color:#00ff99}',
      '#field-balance-hud:active{transform:scale(0.98)}',
      '.fbh-title{font-size:9px;font-weight:700;letter-spacing:.12em;color:#7ec8ff;opacity:.85;margin-bottom:4px}',
      '#fbh-avc{display:block;font-size:15px;font-weight:800;color:#00ff99;text-shadow:0 0 10px rgba(0,255,153,.55)}',
      '.fbh-fiat{display:flex;gap:8px;justify-content:flex-end;margin-top:2px}',
      '#fbh-eur{color:#00dd77;font-weight:700;font-size:11px}',
      '#fbh-usd{color:#8ec8ff;font-weight:700;font-size:11px}',
      '.fbh-mine{display:flex;gap:6px;align-items:center;justify-content:flex-end;margin-top:5px;padding-top:4px;',
      'border-top:1px solid rgba(0,221,119,.2)}',
      '.fbh-mine-icon{font-size:10px;opacity:.8}',
      '#fbh-mine-rate{color:#a8ffcc;font-weight:700;font-size:10px}',
      '#fbh-mine-earned{color:#00ff99;font-weight:800;font-size:10px}',
      '.fbh-mesh{display:flex;gap:6px;justify-content:flex-end;align-items:center;margin-top:4px}',
      '#fbh-peers{font-size:9px;color:#7ec8ff;font-weight:700}',
      '.fbh-p2p{font-size:8px;padding:1px 5px;border-radius:4px;background:rgba(26,111,212,.25);color:#8ec8ff;letter-spacing:.08em}',
      '.fbh-resources{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;margin-top:4px;font-size:8px;color:#6a9aaa;text-align:right}',
      '.fbh-resources b{color:#a8d4ff;font-weight:700;font-size:9px}',
      '#fbh-mine-status{font-size:9px;color:#6a9aaa;margin-top:3px;text-transform:uppercase;letter-spacing:.06em}',
      '#fbh-mine-status.sleep{color:#88ccff;text-shadow:0 0 8px rgba(100,180,255,.5)}',
      '#fbh-mine-status.active{color:#00ff99}',
      '#field-radar{position:fixed;top:10px;left:10px;z-index:42;width:120px;height:120px;pointer-events:none;',
      'border-radius:50%;background:rgba(0,12,28,.45);border:1px solid rgba(0,200,255,.28);',
      'box-shadow:0 0 16px rgba(0,200,255,.12),inset 0 0 24px rgba(0,80,140,.15);overflow:visible}',
      '#field-radar-canvas{width:100%;height:100%;display:block;border-radius:50%}',
      '#field-radar-speed{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:3;',
      'pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;',
      'min-width:52px;text-align:center}',
      '#field-radar .fsh-mode{position:absolute;top:7px;left:9px;z-index:4;font:700 7px/1 system-ui;letter-spacing:.1em;',
      'color:rgba(0,200,255,.65);text-transform:uppercase}',
      '#fsh-value{font:800 16px/1 ui-monospace,monospace;color:#4db8ff;',
      'text-shadow:0 0 10px rgba(77,184,255,.8),0 0 18px rgba(0,120,255,.4)}',
      '#fsh-unit{font:600 7px/1 system-ui;letter-spacing:.14em;color:rgba(77,184,255,.7);margin-top:1px}',
      '#fsh-limit{font:700 8px/1 system-ui;color:rgba(100,200,255,.65);margin-top:2px}',
      '#field-radar-speed.driving #fsh-value{color:#66ccff;text-shadow:0 0 12px rgba(100,200,255,.95)}',
      '#field-radar-speed.earth #fsh-value{color:#5ec8ff}',
      '#field-radar-speed.idle{opacity:0}',
      '.fr-label{position:absolute;bottom:4px;left:0;right:0;text-align:center;font:8px/1 system-ui;',
      'letter-spacing:.14em;color:rgba(0,200,255,.55)}',
      '#field-speed-hud{display:none!important}',
      '#miner-terms-modal{position:fixed;inset:0;z-index:200;display:flex;align-items:center;',
      'justify-content:center;background:rgba(0,4,12,.82);pointer-events:auto}',
      '#miner-terms-modal[hidden]{display:none!important}',
      '.mtm-panel{max-width:min(400px,92vw);padding:18px 20px;border-radius:14px;',
      'background:rgba(4,14,36,.96);border:1px solid rgba(26,111,212,.5);',
      'box-shadow:0 0 32px rgba(13,71,161,.4);font:13px/1.5 system-ui;color:#e8f4ff}',
      '.mtm-title{font-size:14px;font-weight:700;color:#7ec8ff;margin-bottom:10px}',
      '.mtm-panel ul{margin:8px 0 12px 18px;font-size:12px;opacity:.9}',
      '#miner-terms-accept{width:100%;padding:11px;border-radius:10px;border:1px solid #00dd77;',
      'background:rgba(0,221,119,.2);color:#00ff99;font-weight:700;cursor:pointer;font-size:13px}',
      '#zoom-label{top:138px;left:10px;max-width:min(200px,50vw);font-size:10px}',
      '#cosmic-guide{top:160px}',
    ].join('');
    document.head.appendChild(st);
  },

  hideCliMoney() {
    const avc = document.getElementById('aci-avc');
    if (avc) { avc.hidden = true; avc.style.display = 'none'; }
    const sc = window.SuperCli;
    if (sc?.TOOLBAR_VISIBLE) {
      sc.TOOLBAR_VISIBLE = sc.TOOLBAR_VISIBLE.filter(id => id !== 'aci-avc');
    }
  },

  patchSuperCli() {
    const sc = window.SuperCli;
    if (!sc) return false;
    if (sc._fieldHudPatched) return true;
    sc._fieldHudPatched = true;
    const _ensure = sc.ensureBarLayout?.bind(sc);
    if (_ensure) {
      sc.ensureBarLayout = function() {
        _ensure();
        const avc = document.getElementById('aci-avc');
        if (avc) { avc.hidden = true; avc.style.display = 'none'; }
      };
    }
    const _run = sc.run?.bind(sc);
    if (_run) {
      sc.run = function(cmd) {
        const low = String(cmd || '').trim().toLowerCase();
        if (/^(miner|mesh|spacenet miner|rig)$/.test(low)) {
          const m = SpaceNetMiner;
          const lines = [
            '◎ SpaceNet SETI mesh · ' + m._peerCount + ' peers',
            '  CPU ' + (m._rates.cpu || 0) + '% · RAM ' + (m._rates.ram || 0) + 'MB · SSD ' + (m._rates.storage || 0) + 'MB · NET ' + (m._rates.bandwidth || 0) + 'kb/s',
            '  Rate ' + m._mineRate.toFixed(3) + ' AVC/h · session +' + m._sessionEarned.toFixed(3),
            '  Contrib cpu ' + m._contrib.cpu.toFixed(2) + ' · ram ' + m._contrib.ram.toFixed(1) + ' · storage ' + m._contrib.storage.toFixed(1) + ' · bw ' + m._contrib.bandwidth.toFixed(1),
          ];
          window.AciCli?.print?.(lines.join('\n'), 'ok');
          window.ACIControl?.reply?.('SpaceNet mesh · ' + m._peerCount + ' peers · ' + m._mineRate.toFixed(3) + ' AVC/h');
          return;
        }
        return _run(cmd);
      };
    }
    return true;
  },

  ensureBrain() {
    const boot = () => {
      SpaceNetMiner.syncNodePeers();
      window.EarthRealism?.init?.();
      window.BrainNeurons?.boot?.();
    };
    if (window._deferredBootDone) { boot(); return; }
    if (this._brainQueued) return;
    this._brainQueued = true;
    const LM = window.LazyModules;
    if (LM?.scheduleBrain) LM.scheduleBrain(boot);
    else if (LM?.whenReady) LM.whenReady(boot);
    else LM?.schedule?.();
  },

  patchAvcBalance() {
    const AB = window.AvcBalance;
    if (!AB || AB._fieldHudPatched) return;
    AB._fieldHudPatched = true;
    const _render = AB.render?.bind(AB);
    AB.render = (balance, guest, eurUsd) => {
      if (_render) _render(balance, guest, eurUsd);
      FieldHud.updateBalance(balance, guest, eurUsd || AB._fx);
      const avc = document.getElementById('aci-avc');
      if (avc) avc.style.display = 'none';
    };
    const _refresh = AB.refresh?.bind(AB);
    if (_refresh) {
      AB.refresh = async (opts) => {
        const bal = await _refresh(opts);
        FieldHud.updateBalance(AB._last, opts?.guest || !window.Auth?.user, AB._fx);
        return bal;
      };
    }
  },

  updateBalance(balance, guest, fx) {
    const avcEl = document.getElementById('fbh-avc');
    const eurEl = document.getElementById('fbh-eur');
    const usdEl = document.getElementById('fbh-usd');
    if (!avcEl) return;
    const isGuest = guest || !window.Auth?.user;
    const avc = Number(balance || 0);
    const rate = fx || window.AvcBalance?._fx || 1.08;
    avcEl.textContent = isGuest ? '— AVC' : (avc >= 10000 ? (avc / 1000).toFixed(1) + 'k AVC' : avc.toFixed(2) + ' AVC');
    if (eurEl) eurEl.textContent = isGuest ? '€—' : '€' + avc.toFixed(2);
    if (usdEl) usdEl.textContent = isGuest ? '$—' : '$' + (avc * rate).toFixed(2);
  },

  acceptTerms() { return SpaceNetMiner.acceptTerms(); },
  checkTerms() { return SpaceNetMiner.checkTerms(); },
  loadSession() { SpaceNetMiner.loadSession(); this._sessionEarned = SpaceNetMiner._sessionEarned; },
  saveSession() { SpaceNetMiner.saveSession(); },

  deviceLoad() {
    const busy = window.GlobeDeck?.thinking || window._handsFreeVoice || window.DrivingView?.active
      || window.AciCoders?._cliBusy || document.hidden;
    if (busy) return 1;
    const idleMs = Date.now() - (window._lastUserAct || Date.now());
    if (idleMs < 45000) return 0.85;
    if (idleMs < 120000) return 0.35;
    return 0.08;
  },

  isEarthSleepView() {
    const z = window.camera?.position?.z ?? 2.5;
    const level = window.CosmicZoom?.level || 'earth';
    return level === 'earth' && z >= 2.0 && z <= 4.2 && !window.CityMap?.active && !window.DrivingView?.active;
  },

  isSleepMode() {
    const idleMs = Date.now() - (window._lastUserAct || Date.now());
    return this.isEarthSleepView() && idleMs > 180000 && this.deviceLoad() < 0.2;
  },

  async tickMiner(dt) {
    this._mineRate = await SpaceNetMiner.tick(dt);
    this._sessionEarned = SpaceNetMiner._sessionEarned;
    this._termsOk = SpaceNetMiner._termsOk;
    if (this.isSleepMode()) this.ensureSleepAmbient(true);
    else if (this._mineRate > 0.005) this.ensureSleepAmbient(false);
    else this.ensureSleepAmbient(false);
  },

  ensureSleepAmbient(on) {
    if (!on) {
      if (this._audio) { try { this._audio.gain.gain.exponentialRampToValueAtTime(0.001, this._audio.ctx.currentTime + 1.5); } catch (_) {} }
      return;
    }
    if (this._audio?.on) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const gain = ctx.createGain();
      gain.gain.value = 0.04;
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 55;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 82.5;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200;
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc1.start();
      osc2.start();
      this._audio = { ctx, gain, on: true };
    } catch (_) {}
  },

  isGlobalEarthView() {
    const z = window.camera?.position?.z ?? 2.5;
    const level = window.CosmicZoom?.level || 'earth';
    return level === 'earth' && z >= 2.0 && z <= 4.5 && !window.CityMap?.active && !window.DrivingView?.active;
  },

  earthRotationKmh() {
    return this.EARTH_ROTATION_KMH;
  },

  tickEarthSpin() {
    const ER = window.EarthRealism;
    const e = window.earth;
    if (!e) return;
    if (!ER?._inited) { try { ER?.init?.(); } catch (_) {} }
    const now = new Date();
    if (ER?._earthSpin) e.rotation.y = ER._earthSpin(now);
    else e.rotation.y = ((now.getUTCHours() + now.getUTCMinutes() / 60) / 24) * Math.PI * 2;
    if (ER?._solarPosition && ER.sunDir) {
      ER.sunDir.copy(ER._solarPosition(now));
      if (e.material?.uniforms?.sunDirection && ER._sunLocal) {
        e.material.uniforms.sunDirection.value.copy(ER._sunLocal(ER.sunDir));
      }
    }
  },

  speedLimitKmh() {
    if (window.DrivingView?.active) {
      const s = (window.DrivingView?.speed || 0) * 3.6;
      if (s > 70) return 130;
      if (s > 35) return 90;
      return 50;
    }
    if (window.CityMap?.active) return 50;
    return 0;
  },

  updateSpeed() {
    const hud = document.getElementById('field-radar-speed');
    const val = document.getElementById('fsh-value');
    const lim = document.getElementById('fsh-limit');
    const mode = document.getElementById('fsh-mode');
    if (!hud || !val) return;
    let kmh = 0;
    let driving = false;
    let earthSpin = false;
    if (window.DrivingView?.active) {
      kmh = Math.round((window.DrivingView.speed || 0) * 3.6);
      driving = true;
      if (mode) { mode.textContent = 'DRIVE'; mode.style.position = 'absolute'; mode.style.top = '6px'; mode.style.left = '8px'; }
    } else if (this.isGlobalEarthView()) {
      kmh = this.earthRotationKmh();
      earthSpin = true;
      if (mode) { mode.textContent = 'EARTH'; mode.style.position = 'absolute'; mode.style.top = '6px'; mode.style.left = '8px'; }
    } else if (window.CityMap?.active && window.DrivingView?.speed > 0) {
      kmh = Math.round((window.DrivingView.speed || 0) * 3.6);
      driving = true;
      if (mode) mode.textContent = 'CITY';
    } else {
      if (mode) mode.textContent = '';
    }
    val.textContent = String(kmh);
    hud.classList.toggle('driving', driving);
    hud.classList.toggle('earth', earthSpin);
    hud.classList.toggle('idle', kmh < 1 && !earthSpin);
    const limit = this.speedLimitKmh();
    if (lim) {
      if (driving && limit > 0) {
        lim.hidden = false;
        lim.textContent = 'lim ' + limit;
        lim.style.color = kmh > limit ? '#ff6688' : 'rgba(100,200,255,.65)';
      } else {
        lim.hidden = true;
      }
    }
  },

  radarTargets() {
    const me = window._lastPos || { lat: 36.44, lng: 28.22 };
    const out = [];
    const push = (lat, lng, kind, label) => {
      if (lat == null || lng == null) return;
      const d = this.haversineKm(me.lat, me.lng, lat, lng);
      if (d > 25) return;
      const brg = this.bearing(me.lat, me.lng, lat, lng);
      out.push({ d, brg, kind, label });
    };
    (window.others || []).forEach(u => push(u.lat, u.lng, 'friend', u.name));
    (window.Commerce?.vendors || []).forEach(v => push(v.lat, v.lng, 'vendor', v.name));
    if (window.GlobeEntity?.entities) {
      window.GlobeEntity.entities.forEach(e => {
        if (e.lat != null) push(e.lat, e.lng, e.type || 'entity', e.title || e.name);
      });
    }
    (window.FieldBrain?.drivers || []).forEach(d => push(d.lat, d.lng, 'driver', 'driver'));
    const peerN = SpaceNetMiner._peerCount || 0;
    for (let i = 0; i < Math.min(peerN, 6); i++) {
      const ang = (i / Math.max(peerN, 1)) * 360 + (Date.now() / 80) % 360;
      const d = 2 + (i % 3) * 4;
      out.push({ d, brg: ang, kind: 'peer', label: 'mesh' });
    }
    return out;
  },

  haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  bearing(lat1, lng1, lat2, lng2) {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  },

  refreshRadarTargets() {
    const now = Date.now();
    if (now - this._radarTargetsAt < 350) return this._radarTargetsCache;
    this._radarTargetsCache = this.radarTargets();
    this._radarTargetsAt = now;
    return this._radarTargetsCache;
  },

  drawRadar(sweep) {
    const canvas = document.getElementById('field-radar-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = w / 2 - 4;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,200,255,0.2)';
    ctx.lineWidth = 1;
    [0.33, 0.66, 1].forEach(f => {
      ctx.beginPath();
      ctx.arc(cx, cy, r * f, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    const trailSteps = 8;
    const trailSpan = 0.45;
    for (let i = trailSteps; i >= 0; i--) {
      const t = i / trailSteps;
      const angle = sweep - t * trailSpan;
      const alpha = (1 - t) * 0.22;
      const spread = 0.05 + t * 0.18;
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, -spread, spread);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,200,255,' + alpha.toFixed(3) + ')';
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.rotate(sweep);
    ctx.strokeStyle = 'rgba(0,240,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r);
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    const colors = { friend: '#00ff99', vendor: '#ffcc44', driver: '#66aaff', entity: '#aa88ff', delivery: '#ff8844', peer: '#44ddff' };
    this.refreshRadarTargets().forEach(t => {
      const rad = (90 - t.brg) * Math.PI / 180;
      const dist = Math.min(1, t.d / 20);
      const px = cx + Math.cos(rad) * r * dist * 0.92;
      const py = cy - Math.sin(rad) * r * dist * 0.92;
      ctx.fillStyle = colors[t.kind] || '#88ccff';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = 'rgba(0,200,255,0.15)';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#00c8ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  },

  bindActivity() {
    const bump = () => { window._lastUserAct = Date.now(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => {
      window.addEventListener(ev, bump, { passive: true });
    });
    bump();
  },

  tick() {
    const now = Date.now();
    const dt = now - (this._lastTick || now);
    this._lastTick = now;
    void this.tickMiner(dt);
  },

  startFieldRaf() {
    if (this._fieldTimer) return;
    let last = performance.now();
    let tickN = 0;
    // ~4fps radar max — canvas trails are expensive; pause if user idle 45s
    this._fieldTimer = setInterval(() => {
      if (document.hidden || window.CityMap?.active) return;
      const idleMs = Date.now() - (window._lastUserAct || Date.now());
      if (idleMs > 45000) return;
      const now = performance.now();
      const dt = Math.min(80, now - last);
      last = now;
      tickN++;
      this._sweepAngle = (this._sweepAngle || 0) + (Math.PI * 2 / this.SWEEP_PERIOD_MS) * dt;
      if (this._sweepAngle > Math.PI * 2) this._sweepAngle -= Math.PI * 2;
      if (tickN % 1 === 0) this.drawRadar(this._sweepAngle);
      if (tickN % 2 === 0) this.updateSpeed();
    }, 250);
  },

  stopFieldRaf() {
    if (!this._fieldTimer) return;
    clearInterval(this._fieldTimer);
    this._fieldTimer = 0;
  },

  startLoop() {
    if (this._loop) return;
    this._loop = setInterval(() => this.tick(), 1000);
    this.startFieldRaf();
    this.migrateSpeedHud();
  },

  migrateSpeedHud() {
    document.getElementById('field-speed-hud')?.remove();
    const radar = document.getElementById('field-radar');
    if (!radar) return;
    let mode = document.getElementById('fsh-mode');
    const spd = document.getElementById('field-radar-speed');
    if (mode && spd?.contains(mode)) {
      spd.removeChild(mode);
      const canvas = radar.querySelector('#field-radar-canvas');
      if (canvas?.nextSibling) radar.insertBefore(mode, canvas.nextSibling);
      else radar.insertBefore(mode, radar.firstChild?.nextSibling || null);
    }
    if (!mode && !radar.querySelector('#fsh-mode')) {
      mode = document.createElement('span');
      mode.id = 'fsh-mode';
      mode.className = 'fsh-mode';
      const canvas = radar.querySelector('#field-radar-canvas');
      if (canvas?.nextSibling) radar.insertBefore(mode, canvas.nextSibling);
      else radar.appendChild(mode);
    }
    if (!spd) {
      const box = document.createElement('div');
      box.id = 'field-radar-speed';
      box.setAttribute('aria-live', 'polite');
      box.innerHTML = '<span id="fsh-value">0</span><span id="fsh-unit">km/h</span>'
        + '<span id="fsh-limit" hidden></span>';
      const label = radar.querySelector('.fr-label');
      if (label) radar.insertBefore(box, label);
      else radar.appendChild(box);
    }
  },

  boot() {
    if (this._booted) return;
    this._booted = true;
    try {
      this.injectCss();
      this.injectDom();
      this.migrateSpeedHud();
      this.hideCliMoney();
      this.bindActivity();
      this.bindFieldMiner();
      // Defer miner mesh + radar + brain so boot is never sticky
      setTimeout(() => {
        try {
          this.loadSession();
          SpaceNetMiner.detectCaps();
          this.checkTerms();
          this.patchAvcBalance();
          this.patchSuperCli();
        } catch (_) {}
      }, 600);
      setTimeout(() => { try { this.startLoop(); } catch (_) {} }, 1800);
      setTimeout(() => this.ensureBrain(), 5000);
      this._retryPatches();
    } catch (e) { console.error('[FieldHud]', e); }
  },

  _retryPatches() {
    let n = 0;
    const t = setInterval(() => {
      n++;
      this.hideCliMoney();
      this.patchSuperCli();
      this.patchAvcBalance();
      this.migrateSpeedHud();
      this.bindFieldMiner();
      if (!document.getElementById('field-radar')) this.injectDom();
      const ok = document.getElementById('field-radar') && document.getElementById('field-balance-hud')?._minerBound;
      if (ok || n >= 3) clearInterval(t);
    }, 1000);
    window.addEventListener('load', () => {
      this.patchSuperCli();
      this.hideCliMoney();
      this.bindFieldMiner();
      if (!this._fieldTimer) this.startFieldRaf();
    });
  },

  _minerPrefs() {
    try {
      const raw = localStorage.getItem('astranov:miner-rig-prefs');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { cpu: true, ram: true, storage: true, bandwidth: true, sleep: true };
  },

  _saveMinerPrefs(p) {
    try { localStorage.setItem('astranov:miner-rig-prefs', JSON.stringify(p)); } catch (_) {}
  },

  syncMinerChip() {
    const m = SpaceNetMiner;
    const hud = document.getElementById('field-balance-hud');
    if (hud) hud.classList.toggle('mining-active', m._termsOk && m._mineRate > 0.003);
    const rate = document.getElementById('fbh-mine-rate');
    if (rate) rate.textContent = m._mineRate.toFixed(3) + ' AVC/h';
  },

  refreshMinerPanel() {
    const m = SpaceNetMiner;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('mrp-rate', m._mineRate.toFixed(3) + ' AVC/h');
    set('mrp-earned', '+' + m._sessionEarned.toFixed(3));
    set('mrp-peers', String(m._peerCount || 0));
    const bal = window.AvcBalance?._last;
    set('mrp-avc', bal != null ? bal.toFixed(2) + ' AVC' : '— AVC');
    set('sfp-rate', m._mineRate.toFixed(3) + ' AVC/h');
    set('sfp-earned', '+' + m._sessionEarned.toFixed(3));
    set('sfp-peers', String(m._peerCount || 0));
    set('sfp-bal', bal != null ? bal.toFixed(2) + ' AVC' : '— AVC');
    const fx = window.AvcBalance?._fx || 1.08;
    const fiat = document.getElementById('sfp-fiat');
    if (fiat) {
      fiat.textContent = bal != null
        ? ('€' + bal.toFixed(2) + ' · $' + (bal * fx).toFixed(2))
        : '€— · $—';
    }
    const prefs = this._minerPrefs();
    document.querySelectorAll('.mrp-toggle[data-mrp]').forEach(btn => {
      const on = !!prefs[btn.dataset.mrp];
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const start = document.getElementById('mrp-start');
    if (start) {
      start.textContent = m._termsOk ? 'Mining active · adjust & close' : 'I agree · start earning AVC';
    }
    this.syncMinerChip();
  },

  openMinerPanel() { return this.openFinancePanel('mining'); },

  openFinancePanel(tab) {
    const panel = document.getElementById('spacenet-finance-panel');
    if (!panel) return this._openLegacyMiner?.();
    panel.hidden = false;
    panel.classList.add('open');
    SpaceNetFinance.showTab(tab || 'stats');
    this.refreshMinerPanel();
    // Stats/network load off critical path so panel never freezes open
    setTimeout(() => { void SpaceNetFinance.refreshStats(); }, 50);
    GlobeDeck?.expand?.(SuperCli?.title || 'Astranov SpaceNet');
  },

  closeMinerPanel() {
    const panel = document.getElementById('spacenet-finance-panel');
    if (panel) {
      panel.classList.remove('open');
      panel.hidden = true;
    }
    const legacy = document.getElementById('miner-rig-panel');
    if (legacy) {
      legacy.classList.remove('open');
      legacy.hidden = true;
    }
  },

  bindFieldMiner() {
    if (!this._minerPanelBound) {
      this._minerPanelBound = true;
      SpaceNetFinance.bind();
      document.querySelectorAll('.mrp-toggle[data-mrp]').forEach(tog => {
        if (tog._mrpBound) return;
        tog._mrpBound = true;
        tog.addEventListener('click', e => {
          e.stopPropagation();
          const prefs = this._minerPrefs();
          const k = tog.dataset.mrp;
          prefs[k] = !prefs[k];
          this._saveMinerPrefs(prefs);
          tog.classList.toggle('on', prefs[k]);
          tog.setAttribute('aria-pressed', prefs[k] ? 'true' : 'false');
          AciCli?.print?.('miner · ' + k + ' ' + (prefs[k] ? 'on' : 'off'), 'ok');
        });
      });
      document.getElementById('mrp-start')?.addEventListener('click', () => {
        if (!SpaceNetMiner._termsOk) SpaceNetMiner.acceptTerms();
        else this.closeMinerPanel();
        this.refreshMinerPanel();
        ACIControl?.reply?.('SpaceNet miner rig · earning AVC on your devices');
      });
    }
    const hud = document.getElementById('field-balance-hud');
    if (!hud || hud._minerBound) return;
    hud._minerBound = true;
    if (!hud.getAttribute('role')) {
      hud.setAttribute('role', 'button');
      hud.setAttribute('tabindex', '0');
      hud.setAttribute('title', 'SpaceNet finance · balance · mining · 3% invoices · P2P reports');
      hud.setAttribute('aria-label', 'Open SpaceNet finance multi-tile');
    }
    const open = e => {
      e.preventDefault();
      e.stopPropagation();
      this.openFinancePanel('stats');
    };
    hud.addEventListener('click', open);
    hud.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openFinancePanel('stats'); }
    });
  },
};

// === SPACENET FINANCE — multi-tile from field balance: stats · mining · 3% invoices · P2P · reports ===
const SpaceNetFinance = {
  PLATFORM: 0.03,
  DRIVER_GROSS: 0.15,
  _orders: [],
  _bound: false,
  _lastReport: '',

  bind() {
    if (this._bound) return;
    this._bound = true;
    const panel = document.getElementById('spacenet-finance-panel');
    document.getElementById('sfp-close')?.addEventListener('click', () => FieldHud.closeMinerPanel());
    panel?.addEventListener('click', e => { if (e.target === panel) FieldHud.closeMinerPanel(); });
    document.querySelectorAll('.sfp-tile[data-sfp]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.showTab(btn.dataset.sfp);
      });
    });
    this._fillMonthSelects();
    document.getElementById('sfp-open-wallet')?.addEventListener('click', () => {
      window.CoinPortal?.open?.('wallet');
      void window.AvcBalance?.refresh?.();
    });
    document.getElementById('sfp-refresh-stats')?.addEventListener('click', () => void this.refreshStats());
    document.getElementById('sfp-plat-run')?.addEventListener('click', () => void this.buildPlatformInvoice());
    document.getElementById('sfp-plat-export')?.addEventListener('click', () => this.exportText('platform'));
    document.getElementById('sfp-p2p-run')?.addEventListener('click', () => void this.buildP2pLedger());
    document.getElementById('sfp-p2p-export')?.addEventListener('click', () => this.exportText('p2p'));
    document.getElementById('sfp-run-report')?.addEventListener('click', () => void this.produceReport());
    document.getElementById('sfp-export')?.addEventListener('click', () => this.exportText('report'));
  },

  showTab(id) {
    document.querySelectorAll('.sfp-tile[data-sfp]').forEach(b => b.classList.toggle('active', b.dataset.sfp === id));
    document.querySelectorAll('.sfp-pane[data-sfp-pane]').forEach(p => p.classList.toggle('active', p.dataset.sfpPane === id));
    if (id === 'platform') void this.buildPlatformInvoice();
    if (id === 'p2p') void this.buildP2pLedger();
    if (id === 'stats' || id === 'mining') FieldHud.refreshMinerPanel();
  },

  _fillMonthSelects() {
    const now = new Date();
    const opts = [];
    for (let i = 0; i < 18; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const v = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const label = d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
      opts.push('<option value="' + v + '">' + label + '</option>');
    }
    ['sfp-plat-month', 'sfp-rep-from', 'sfp-rep-to'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.options.length) el.innerHTML = opts.join('');
    });
  },

  async loadOrders() {
    if (!window.Auth?.user) {
      this._orders = [];
      return [];
    }
    if (this._loadInflight) return this._loadInflight;
    const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), 4000));
    this._loadInflight = (async () => {
      try {
        const work = (async () => {
          const uid = Auth.user.id;
          const client = Auth.client;
          if (client?.from) {
            const [cRes, dRes] = await Promise.all([
              client.from('orders').select('*').eq('customer_id', uid).order('created_at', { ascending: false }).limit(60),
              client.from('orders').select('*').eq('driver_id', uid).order('created_at', { ascending: false }).limit(60),
            ]);
            let asVendor = [];
            const owned = (window.Commerce?.vendors || []).filter(v => v.owner_id === uid || v.user_id === uid);
            if (owned.length) {
              const ids = owned.map(v => v.id).filter(Boolean).slice(0, 12);
              if (ids.length) {
                const vRes = await client.from('orders').select('*').in('vendor_id', ids).order('created_at', { ascending: false }).limit(60);
                asVendor = vRes?.data || [];
              }
            }
            const seen = new Set();
            this._orders = [...(cRes?.data || []), ...(dRes?.data || []), ...asVendor].filter(o => {
              if (!o?.id || seen.has(o.id)) return false;
              seen.add(o.id);
              return true;
            });
          } else {
            this._orders = (window.MarketplaceDeliveryEngine?.missions || [])
              .map(m => m.order).filter(Boolean);
          }
        })();
        const raced = await Promise.race([work.then(() => 'ok'), timeout]);
        if (raced === 'timeout') {
          this._orders = this._orders?.length
            ? this._orders
            : (window.MarketplaceDeliveryEngine?.missions || []).map(m => m.order).filter(Boolean);
        }
      } catch (_) {
        this._orders = (window.MarketplaceDeliveryEngine?.missions || [])
          .map(m => m.order).filter(Boolean);
      }
      this._loadInflight = null;
      return this._orders;
    })();
    return this._loadInflight;
  },

  orderGross(o) {
    const c = o?.calc || {};
    if (c.total_avc != null) return Number(c.total_avc) || 0;
    if (c.total_eur != null) return Number(c.total_eur) || 0;
    const items = Array.isArray(o?.items) ? o.items : [];
    return items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.price) || 0), 0);
  },

  orderGoods(o) {
    const c = o?.calc || {};
    if (c.subtotal_eur != null) return Number(c.subtotal_eur) || 0;
    if (c.goods_eur != null) return Number(c.goods_eur) || 0;
    return this.orderGross(o) * 0.75;
  },

  orderDelivery(o) {
    const c = o?.calc || {};
    if (c.delivery_eur != null) return Number(c.delivery_eur) || 0;
    return Math.max(0, this.orderGross(o) - this.orderGoods(o));
  },

  platformFee(o) {
    const c = o?.calc || {};
    if (c.platform_fee_eur != null) return Number(c.platform_fee_eur) || 0;
    return Math.round(this.orderGross(o) * this.PLATFORM * 100) / 100;
  },

  driverFromVendor(o) {
    const c = o?.calc || {};
    if (c.driver_from_vendor_eur != null) return Number(c.driver_from_vendor_eur) || 0;
    return Math.round(this.orderGoods(o) * this.DRIVER_GROSS * 100) / 100;
  },

  inMonth(iso, ym) {
    if (!iso || !ym) return true;
    return String(iso).slice(0, 7) === ym;
  },

  inPeriod(iso, period) {
    if (!iso || period === 'all') return true;
    const t = new Date(iso).getTime();
    if (!isFinite(t)) return true;
    const now = Date.now();
    if (period === 'mtd') {
      const d = new Date();
      return t >= new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    }
    if (period === '30d') return t >= now - 30 * 864e5;
    if (period === '90d') return t >= now - 90 * 864e5;
    if (period === 'ytd') return t >= new Date(new Date().getFullYear(), 0, 1).getTime();
    return true;
  },

  async refreshStats() {
    await this.loadOrders();
    FieldHud.refreshMinerPanel();
    const ym = new Date().toISOString().slice(0, 7);
    const mtd = this._orders.filter(o => this.inMonth(o.created_at, ym));
    const fee = mtd.reduce((s, o) => s + this.platformFee(o), 0);
    const p2p = mtd.reduce((s, o) => s + this.orderGross(o), 0);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('sfp-orders-n', String(this._orders.length));
    set('sfp-fee-mtd', fee.toFixed(2) + ' AVC');
    set('sfp-p2p-mtd', p2p.toFixed(2) + ' AVC');
  },

  async buildPlatformInvoice() {
    await this.loadOrders();
    const ym = document.getElementById('sfp-plat-month')?.value || new Date().toISOString().slice(0, 7);
    const role = document.getElementById('sfp-plat-role')?.value || 'all';
    const uid = Auth?.user?.id;
    let rows = this._orders.filter(o => this.inMonth(o.created_at, ym));
    if (role === 'client') rows = rows.filter(o => o.customer_id === uid);
    if (role === 'driver') rows = rows.filter(o => o.driver_id === uid);
    if (role === 'vendor') {
      const vids = new Set((Commerce?.vendors || []).filter(v => v.owner_id === uid).map(v => v.id));
      rows = rows.filter(o => vids.has(o.vendor_id));
    }
    const tbody = document.querySelector('#sfp-plat-table tbody');
    let total = 0;
    const lines = rows.map(o => {
      const fee = this.platformFee(o);
      total += fee;
      const party = o.customer_id === uid ? 'client' : o.driver_id === uid ? 'driver' : 'vendor';
      const day = (o.created_at || '').slice(0, 10);
      return '<tr><td>' + day + '</td><td>' + (o.short_id || String(o.id).slice(0, 8))
        + '</td><td>' + party + '</td><td class="num">' + this.orderGross(o).toFixed(2)
        + '</td><td class="num">' + fee.toFixed(2) + '</td></tr>';
    });
    if (tbody) tbody.innerHTML = lines.length ? lines.join('') : '<tr><td colspan="5">No orders this month — place or deliver to populate</td></tr>';
    const tot = document.getElementById('sfp-plat-total');
    if (tot) tot.textContent = total.toFixed(2) + ' AVC';
    this._lastReport = this._formatPlatformInvoice(ym, role, rows, total);
    AciCli?.print?.('platform 3% invoice · ' + ym + ' · ' + total.toFixed(2) + ' AVC', 'ok');
  },

  _formatPlatformInvoice(ym, role, rows, total) {
    const who = Auth?.user?.email || Auth?.user?.id || 'user';
    let s = 'ASTRANOV SPACENET — PLATFORM 3% MONTHLY INVOICE\n';
    s += 'Period: ' + ym + ' · Issued to: ' + who + ' · Role filter: ' + role + '\n';
    s += 'Rate: 3% of transaction gross (goods + delivery)\n';
    s += '────────────────────────────────────────\n';
    rows.forEach(o => {
      s += (o.created_at || '').slice(0, 10) + '  ' + (o.short_id || o.id) + '  gross '
        + this.orderGross(o).toFixed(2) + '  fee ' + this.platformFee(o).toFixed(2) + ' AVC\n';
    });
    s += '────────────────────────────────────────\n';
    s += 'TOTAL PLATFORM FEE DUE: ' + total.toFixed(2) + ' AVC (= EUR)\n';
    s += 'Invoice from Astranov SpaceNet · collective infrastructure\n';
    return s;
  },

  async buildP2pLedger() {
    await this.loadOrders();
    const flow = document.getElementById('sfp-p2p-flow')?.value || 'all';
    const period = document.getElementById('sfp-p2p-period')?.value || 'mtd';
    const rows = this._orders.filter(o => this.inPeriod(o.created_at, period));
    const entries = [];
    rows.forEach(o => {
      const goods = this.orderGoods(o);
      const del = this.orderDelivery(o);
      const d15 = this.driverFromVendor(o);
      const oid = o.short_id || String(o.id).slice(0, 8);
      const when = (o.created_at || '').slice(0, 10);
      const client = 'Client';
      const vendor = o.vendor_name || 'Vendor';
      const driver = o.driver_name || 'Driver';
      if (flow === 'all' || flow === 'client_vendor') {
        entries.push({ when, flow: client + ' → ' + vendor, oid, amount: goods, kind: 'client_vendor' });
      }
      if (flow === 'all' || flow === 'client_driver') {
        entries.push({ when, flow: client + ' → ' + driver, oid, amount: del, kind: 'client_driver' });
      }
      if (flow === 'all' || flow === 'vendor_driver') {
        entries.push({ when, flow: vendor + ' → ' + driver + ' (15%)', oid, amount: d15, kind: 'vendor_driver' });
      }
      if (flow === 'all' || flow === 'driver_vendor') {
        entries.push({ when, flow: driver + ' ↔ ' + vendor, oid, amount: goods - d15, kind: 'driver_vendor' });
      }
    });
    const tbody = document.querySelector('#sfp-p2p-table tbody');
    let total = 0;
    const html = entries.map(e => {
      total += e.amount;
      return '<tr><td>' + e.when + '</td><td>' + e.flow + '</td><td>' + e.oid
        + '</td><td class="num">' + e.amount.toFixed(2) + '</td></tr>';
    });
    if (tbody) tbody.innerHTML = html.length ? html.join('') : '<tr><td colspan="4">No P2P lines — need orders with parties</td></tr>';
    const tot = document.getElementById('sfp-p2p-total');
    if (tot) tot.textContent = total.toFixed(2) + ' AVC';
    this._lastReport = this._formatP2p(flow, period, entries, total);
  },

  _formatP2p(flow, period, entries, total) {
    let s = 'ASTRANOV SPACENET — P2P ACCUMULATIVE LEDGER\n';
    s += 'Flow: ' + flow + ' · Period: ' + period + '\n';
    s += 'Includes vendor→driver 15% gross · client→vendor goods · client→driver delivery\n';
    s += '────────────────────────────────────────\n';
    entries.forEach(e => {
      s += e.when + '  ' + e.flow + '  ' + e.oid + '  ' + e.amount.toFixed(2) + ' AVC\n';
    });
    s += '────────────────────────────────────────\nTOTAL: ' + total.toFixed(2) + ' AVC\n';
    return s;
  },

  async produceReport() {
    await this.loadOrders();
    const type = document.getElementById('sfp-rep-type')?.value || 'full_statement';
    const role = document.getElementById('sfp-rep-role')?.value || 'auto';
    const from = document.getElementById('sfp-rep-from')?.value;
    const to = document.getElementById('sfp-rep-to')?.value;
    const ymOk = (iso) => {
      const m = (iso || '').slice(0, 7);
      if (from && m < from) return false;
      if (to && m > to) return false;
      return true;
    };
    const rows = this._orders.filter(o => ymOk(o.created_at));
    let text = 'ASTRANOV SPACENET STATEMENT\nBuild ' + (document.querySelector('meta[name="astranov-build"]')?.content || '') + '\n';
    text += 'User: ' + (Auth?.user?.email || 'guest') + ' · Role: ' + role + '\n';
    text += 'Range: ' + (from || '…') + ' → ' + (to || '…') + '\n\n';

    if (type === 'mining') {
      const m = SpaceNetMiner;
      text += 'MINING\nRate ' + m._mineRate.toFixed(3) + ' AVC/h · session +' + m._sessionEarned.toFixed(3)
        + ' · peers ' + m._peerCount + ' · terms ' + (m._termsOk ? 'ok' : 'pending') + '\n';
    } else if (type === 'platform_monthly') {
      const fee = rows.reduce((s, o) => s + this.platformFee(o), 0);
      text += this._formatPlatformInvoice(from || to || 'range', role, rows, fee);
    } else if (type === 'p2p_cumulative') {
      await this.buildP2pLedger();
      text += this._lastReport;
    } else if (type === 'driver_earnings') {
      text += 'DRIVER EARNINGS (15% gross goods + delivery share)\n';
      let t = 0;
      rows.filter(o => o.driver_id === Auth?.user?.id || role === 'auto').forEach(o => {
        const a = this.driverFromVendor(o) + this.orderDelivery(o) * 0.85;
        t += a;
        text += (o.short_id || o.id) + '  ' + a.toFixed(2) + ' AVC\n';
      });
      text += 'TOTAL DRIVER: ' + t.toFixed(2) + ' AVC\n';
    } else if (type === 'vendor_sales') {
      text += 'VENDOR SALES + FEES PAID TO SPACENET 3% + DRIVER 15%\n';
      let sales = 0, fees = 0, dpay = 0;
      rows.forEach(o => {
        sales += this.orderGoods(o);
        fees += this.platformFee(o);
        dpay += this.driverFromVendor(o);
      });
      text += 'Sales goods: ' + sales.toFixed(2) + '\nPlatform 3%: ' + fees.toFixed(2)
        + '\nDriver 15% gross: ' + dpay.toFixed(2) + '\n';
    } else if (type === 'client_spend') {
      text += 'CLIENT SPEND\n';
      let t = 0;
      rows.filter(o => o.customer_id === Auth?.user?.id || role === 'auto').forEach(o => {
        t += this.orderGross(o);
        text += (o.short_id || o.id) + '  ' + this.orderGross(o).toFixed(2) + ' AVC\n';
      });
      text += 'TOTAL SPEND: ' + t.toFixed(2) + ' AVC\n';
    } else {
      const fee = rows.reduce((s, o) => s + this.platformFee(o), 0);
      const gross = rows.reduce((s, o) => s + this.orderGross(o), 0);
      text += 'FULL STATEMENT\nOrders: ' + rows.length + '\nGross volume: ' + gross.toFixed(2)
        + ' AVC\nPlatform 3% cumulative: ' + fee.toFixed(2) + ' AVC\n';
      text += 'Driver 15% gross cumulative: '
        + rows.reduce((s, o) => s + this.driverFromVendor(o), 0).toFixed(2) + ' AVC\n';
      text += '\n' + this._formatPlatformInvoice(from || 'range', role, rows, fee);
    }

    this._lastReport = text;
    const out = document.getElementById('sfp-rep-out');
    if (out) out.textContent = text;
    AciCli?.print?.('report · ' + type + ' · ' + rows.length + ' orders', 'ok');
  },

  exportText(kind) {
    const text = this._lastReport || document.getElementById('sfp-rep-out')?.textContent || '';
    if (!text) {
      AciCli?.print?.('Nothing to export — run report first', 'dim');
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text).then(() => {
          AciCli?.print?.('Invoice/report copied to clipboard', 'ok');
          ACIControl?.reply?.('SpaceNet report copied · paste into email or accounting');
        });
      } else {
        AciCli?.print?.(text.slice(0, 400), 'ok');
      }
    } catch (_) {
      AciCli?.print?.(text.slice(0, 500), 'ok');
    }
  },
};
window.SpaceNetFinance = SpaceNetFinance;

function fieldHudBoot() {
  try { FieldHud.boot(); } catch (e) { console.error('[FieldHud boot]', e); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fieldHudBoot);
else fieldHudBoot();
window.FieldHud = FieldHud;
window.AstranovMiner = SpaceNetMiner;