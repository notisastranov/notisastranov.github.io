// === ASTRANOV NODE — PWA/native install + decentralized batch work together ===
const AstranovNode = {
  batchId: null,
  shortId: null,
  nodeId: null,
  channel: null,
  rtChannel: null,
  peerCount: 0,
  deferredPrompt: null,
  _hb: null,
  _open: false,

  platform() {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    return 'desktop';
  },

  isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
      || localStorage.getItem('astranov_installed') === '1';
  },

  installMode() {
    if (this.isInstalled()) return this.platform() === 'ios' ? 'pwa-ios' : 'pwa';
    return 'browser';
  },

  async api(body) {
    if (Auth?.whenReady) await Auth.whenReady();
    const headers = Auth?.authHeaders ? await Auth.authHeaders() : sbHeaders();
    const fnBase = typeof resolveAstranovFunctionsUrl === 'function' ? resolveAstranovFunctionsUrl() : (SB_URL + '/functions/v1');
    const r = await fetch(fnBase + '/node-batch', {
      method: 'POST', headers,
      body: JSON.stringify(body),
    });
    return r.json().catch(() => ({}));
  },

  pos() {
    return window._lastPos || { lat: 36.4239, lng: 28.2245 };
  },

  getDeviceNodeId() {
    return AstranovSession?.getDeviceNodeId?.() || this.nodeId;
  },

  async resumeSession() {
    if (!Auth?.user) return null;
    const nodeId = this.getDeviceNodeId();
    const r = await this.api({
      action: 'resume',
      node_id: nodeId,
      device_id: AstranovSession?.deviceId?.(),
      platform: this.platform(),
      install_mode: this.installMode(),
      lat: this.pos().lat,
      lng: this.pos().lng,
      session_name: AstranovSession?.SESSION_NAME,
      batch_short_id: AstranovSession?.BATCH_SHORT_ID,
    });
    if (r.ok && r.resume) return this._applyBatchResult(r, { quiet: true });
    return null;
  },

  resumeFromServer(session) {
    if (!session?.shortId || !Auth?.user) return;
    if (this.batchId && this.shortId === session.shortId) return;
    this.api({
      action: 'resume',
      node_id: session.nodeId || this.getDeviceNodeId(),
      device_id: AstranovSession?.deviceId?.(),
      platform: this.platform(),
      install_mode: this.installMode(),
      lat: session.lastPos?.lat ?? this.pos().lat,
      lng: session.lastPos?.lng ?? this.pos().lng,
    }).then(r => {
      if (r.ok && (r.resume || r.batch_id)) this._applyBatchResult(r, { quiet: true });
    }).catch(() => {});
  },

  async _applyBatchResult(r, opts) {
    opts = opts || {};
    this.batchId = r.batch_id;
    this.shortId = r.short_id;
    this.nodeId = r.node_id;
    this.peerCount = r.peers || 1;

    await this.joinBatchChannel(r.channel || ('astranov-batch-' + r.short_id));
    this.startHeartbeat();
    const label = AstranovSession?.sessionLabel?.() || 'ASTRANOV COLLECTIVE INTELLIGENCE';
    if (!opts.quiet) {
      AciCli?.print('◎ ' + label + ' · ' + this.peerCount + ' device(s)', 'ok');
    } else {
      GlobeDeck?.setPreview?.('◎ ' + label + ' · ' + this.peerCount + ' device(s)');
    }
    GlobeDeck?.setTitle?.(label);
    if (window.AIGraphics?.setSuperBatchActive) {
      AIGraphics.setSuperBatchActive(true, { batchId: r.short_id, peers: this.peerCount, lat: this.pos().lat, lng: this.pos().lng });
    }
    return r;
  },

  init() {
    try {
      this.nodeId = AstranovSession?.getDeviceNodeId?.() || null;
    } catch { /* */ }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.updateInstallUI();
    });
    window.addEventListener('appinstalled', () => {
      localStorage.setItem('astranov_installed', '1');
      this.setStep(2, 'done', 'Εγκατεστημένο — Astranov node ενεργό');
      this.updateInstallUI();
      FieldBrain?.pulse('batch', 'pwa installed', { props: { visual_truth: true } });
    });
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              ACIControl?.reply('New Astranov build — tap logo to refresh');
            }
          });
        });
      }).catch(() => {});
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        const build = document.querySelector('meta[name="astranov-build"]')?.content;
        if (build) {
          const url = new URL(location.href);
          url.searchParams.set('v', build);
          location.replace(url.toString());
        }
      });
    }
    this.bindUI();
    if (Auth?.client) {
      Auth.client.auth.onAuthStateChange((_e, session) => {
        if (session?.user) setTimeout(() => this.maybePromptInstall(), 4000);
      });
    }
    if (location.hash === '#install-android' || location.hash === '#install-ios') this.showPanel();
  },

  bindUI() {
    document.getElementById('nb-close')?.addEventListener('click', () => this.hidePanel());
    document.getElementById('nb-launch')?.addEventListener('click', () => this.launchBatch());
    document.getElementById('nb-install-android')?.addEventListener('click', () => this.installAndroid());
    document.getElementById('nb-install-ios')?.addEventListener('click', () => this.showIosHelp());
    document.getElementById('nb-join-comms')?.addEventListener('click', () => Comms?.startVHF?.());
  },

  showPanel() {
    this._open = true;
    GlobeDeck?.showStage('node-batch', 'batch');
    this.renderPlatform();
    this.updateInstallUI();
    MapDepict?.action('batch', { detail: 'work together · install node' });
  },

  hidePanel() {
    this._open = false;
    document.getElementById('node-batch')?.classList.remove('open', 'deck-active');
    if (GlobeDeck?.activeTask === 'batch') GlobeDeck?.completeTask('batch');
  },

  renderPlatform() {
    const el = document.getElementById('nb-platform');
    if (!el) return;
    const p = this.platform();
    const labels = { android: '🤖 Android', ios: '🍎 Apple iOS', desktop: '💻 Desktop' };
    el.textContent = labels[p] || p;
    const iosBox = document.getElementById('nb-ios-steps');
    const andBtn = document.getElementById('nb-install-android');
    const iosBtn = document.getElementById('nb-install-ios');
    if (iosBox) iosBox.style.display = p === 'ios' ? 'block' : 'none';
    if (iosBtn) iosBtn.style.display = p === 'ios' ? 'block' : 'none';
    if (andBtn) andBtn.style.display = p === 'ios' ? 'none' : 'block';
  },

  setStep(n, state, msg) {
    const el = document.getElementById('nb-step-' + n);
    if (!el) return;
    el.className = 'nb-step nb-' + state;
    const m = el.querySelector('.nb-step-msg');
    if (m) m.textContent = msg;
  },

  updateInstallUI() {
    const installed = this.isInstalled();
    const canPwa = !!this.deferredPrompt;
    const p = this.platform();
    if (installed) {
      this.setStep(2, 'done', 'Native/PWA node εγκατεστημένο — relay + comms ενεργά');
    } else if (p === 'ios') {
      this.setStep(2, 'active', 'Safari → Share → Add to Home Screen');
    } else if (canPwa) {
      this.setStep(2, 'active', 'Πάτα Εγκατάσταση Android — PWA node');
    } else {
      this.setStep(2, 'active', 'Εγκατάσταση native app (σύντομα) ή PWA από Chrome');
    }
    const st = document.getElementById('nb-status');
    if (st) {
      st.textContent = installed
        ? 'Node installed · batch channel: ' + (this.shortId || '—')
        : 'Εγκατάστησε Astranov node για δουλειά μαζί χωρίς browser tabs';
    }
  },

  maybePromptInstall() {
    if (this.isInstalled() || this._open) return;
    if (sessionStorage.getItem('astranov_install_nudge') === '1') return;
    sessionStorage.setItem('astranov_install_nudge', '1');
    this.showPanel();
    ACIControl?.reply('Εγκατάστησε Astranov node — δουλεύουμε μαζί από την εφαρμογή');
  },

  async installAndroid() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
      this.deferredPrompt = null;
      if (outcome === 'accepted') {
        localStorage.setItem('astranov_installed', '1');
        this.setStep(2, 'done', 'Εγκατάσταση ξεκίνησε — άνοιξε από home screen');
        AciCli?.print('Astranov PWA install accepted', 'ok');
        return;
      }
    }
    ACIControl?.reply('Chrome: Menu ⋮ → Install app · ή Add to Home Screen');
    AciCli?.print('No install prompt — use Chrome menu → Install Astranov', 'dim');
  },

  showIosHelp() {
    this.setStep(2, 'active', 'Safari Share ⬆️ → Add to Home Screen ➕ → open Astranov');
    ACIControl?.reply('iOS: Share → Add to Home Screen — μετά άνοιξε το Astranov icon');
    const box = document.getElementById('nb-ios-steps');
    if (box) box.style.display = 'block';
  },

  /** Rule: always verify basics before batch launch (think, session, bridge). */
  BATCH_RULE: 'Verify production basics before launching batch — never skip preflight.',

  async preflightVerify() {
    const checks = [];
    const record = (name, ok, detail) => { checks.push({ name, ok, detail }); return ok; };

    const session = Auth?.ensureSession ? await Auth.ensureSession() : null;
    if (!record('session', !!(session?.access_token), session?.access_token ? 'jwt ok' : 'expired — sign in again')) {
      return { ok: false, checks, error: 'session expired — tap G' };
    }

    try {
      const think = AciCli?.api
        ? await AciCli.api({ mode: 'think', prompt: 'ping' })
        : await ACI.api({ mode: 'think', prompt: 'ping' });
      const thinkText = String(think?.text || think?.response || '').trim();
      if (!record('aci think', !!thinkText && !think.error, thinkText ? thinkText.slice(0, 40) : (think?.error || 'no response'))) {
        return { ok: false, checks, error: 'ACI think unreachable' };
      }
    } catch (e) {
      record('aci think', false, String(e.message || e));
      return { ok: false, checks, error: 'ACI think failed' };
    }

    try {
      const headers = await Auth.authHeaders();
      const bridge = await fetchJson(SB_URL + '/functions/v1/coders-bridge', {
        method: 'POST', headers,
        body: JSON.stringify({ mode: 'pending', limit: 3 }),
      }, 20000);
      if (!record('coders bridge', !!bridge.ok, bridge.ok ? 'reachable' : (bridge.error || 'down'))) {
        return { ok: false, checks, error: 'coders bridge down' };
      }
    } catch (e) {
      record('coders bridge', false, String(e.message || e));
      return { ok: false, checks, error: 'coders bridge failed' };
    }

    try {
      const sync = await AciCli?.api({ mode: 'owner_sync' });
      record('owner sync', !!sync.ok, sync.is_owner ? 'owner' : 'user');
    } catch (e) {
      record('owner sync', false, String(e.message || e));
    }

    return { ok: true, checks };
  },

  async launchBatch() {
    if (!Auth?.user) {
      this.showPanel();
      this.setStep(1, 'active', 'Σύνδεση απαιτείται — πάτα G');
      Auth?.openLoginModal?.('Sign in to launch super batch');
      ACIControl?.reply('Sign in with G — then launch batch again');
      return;
    }

    this.showPanel();
    const who = AstranovSession?.isAstranov?.() ? 'ASTRANOV' : (Auth.user.email?.split('@')[0] || 'user');
    this.setStep(1, 'done', 'Συνδεδεμένος · ' + who);
    this.setStep(3, 'active', 'Σύνδεση στη συλλογική συνεδρία…');

    let existing = await this.resumeSession();
    if (!existing && AstranovSession?.isAstranov?.()) {
      await AstranovNode.api({ action: 'session_purge' });
      existing = await this.resumeSession();
    }
    if (existing) {
      const label = AstranovSession?.sessionLabel?.() || 'ASTRANOV COLLECTIVE INTELLIGENCE';
      const peerEl = document.getElementById('nb-peers');
      if (peerEl) peerEl.textContent = String(this.peerCount);
      const idEl = document.getElementById('nb-batch-id');
      if (idEl) idEl.textContent = label;
      this.setStep(3, 'done', label + ' · ' + this.peerCount + ' device(s)');
      ACIControl?.reply(label + ' · resumed on this device');
      return existing;
    }

    if (AstranovSession?.isAstranov?.()) {
      this.setStep(3, 'blocked', 'Collective session missing — retry');
      ACIControl?.reply('Collective session unavailable — refresh and sign in as ASTRANOV');
      return { ok: false, error: 'collective_unavailable' };
    }

    this.setStep(3, 'active', 'Preflight verify…');

    const pre = await this.preflightVerify();
    if (!pre.ok) {
      this.setStep(3, 'blocked', pre.error || 'preflight failed');
      const failed = (pre.checks || []).filter(c => !c.ok).map(c => c.name).join(', ');
      AciCli?.print('batch blocked — verify failed: ' + (failed || pre.error), 'err');
      ACIControl?.reply('Batch blocked — fix: ' + (pre.error || failed));
      return { ok: false, preflight: pre };
    }

    if (AciCli) {
      AciCli.print('preflight OK — ' + pre.checks.map(c => c.name).join(', '), 'ok');
    }
    this.setStep(3, 'active', 'Εκκίνηση batch…');

    const pos = this.pos();
    const r = await this.api({
      action: 'launch',
      node_id: this.getDeviceNodeId() || undefined,
      device_id: AstranovSession?.deviceId?.(),
      platform: this.platform(),
      install_mode: this.installMode(),
      lat: pos.lat,
      lng: pos.lng,
      session_name: AstranovSession?.SESSION_NAME,
      batch_short_id: AstranovSession?.BATCH_SHORT_ID,
      props: { ua: navigator.userAgent?.slice(0, 120), session_name: AstranovSession?.SESSION_NAME },
    });

    if (!r.ok) {
      this.setStep(3, 'blocked', r.error || 'batch failed');
      ACIControl?.reply('Batch failed: ' + (r.error || 'server'));
      return;
    }

    await this._applyBatchResult(r);
    this.peerCount = r.peers || 1;

    const peerEl = document.getElementById('nb-peers');
    if (peerEl) peerEl.textContent = String(this.peerCount);
    const idEl = document.getElementById('nb-batch-id');
    const label = AstranovSession?.sessionLabel?.() || r.short_id;
    if (idEl) idEl.textContent = label;

    this.setStep(3, 'done', label + ' · channel live');
    if (!this.isInstalled()) this.setStep(2, 'active', 'Εγκατάστασε node για πλήρη native relay');
    else this.setStep(2, 'done', 'Node ενεργό — decentralized server applet');

    this.registerSuperBookingSync();

    const resumed = r.resumed ? ' — same session on all devices' : '';
    const msg = label + ' live · ' + this.peerCount + ' device(s)' + resumed;
    ACIControl?.reply(msg);
    MapDepict?.action('batch', { lat: pos.lat, lng: pos.lng, detail: r.short_id + ' · ' + this.peerCount + ' nodes' });
    FieldBrain?.pulse('batch', r.short_id + ' · peers ' + this.peerCount, { role: 'client', props: { batch_id: r.batch_id, node_id: r.node_id } });

    document.getElementById('node-batch')?.classList.add('nb-super-live');
    const meshSt = document.getElementById('nb-mesh-status');
    if (meshSt) meshSt.textContent = 'mesh live · ' + this.peerCount + ' device(s)';
    if (window.AIGraphics?.setSuperBatchActive) {
      AIGraphics.setSuperBatchActive(true, { batchId: r.short_id, peers: this.peerCount, lat: pos.lat, lng: pos.lng });
    }
    if (window.SuperSpaceHud?.showBatch) SuperSpaceHud.showBatch(label, this.peerCount);

    if (Voice.maySpeak()) speak(msg.slice(0, 120), () => resumeListening());
  },

  /** Register local Astranov Decentralized Server for Astranov Sites sync relay */
  registerSuperBookingSync() {
    const port = localStorage.getItem('astranov_decentral_port') || '8787';
    const url = 'http://127.0.0.1:' + port;
    const meta = { platform: this.platform(), nodeId: this.nodeId, batchId: this.batchId };
    try {
      localStorage.setItem('astranov_decentral_node_v1', JSON.stringify({ url, registeredAt: Date.now(), ...meta }));
    } catch { /* */ }
    const decentral = window.AstranovSitesDecentral || window.SuperBookingDecentral;
    if (decentral?.registerNode) decentral.registerNode(url, meta);
    AciCli?.print('Astranov Sites sync node · ' + url + '/superbooking/sync', 'ok');
  },

  async joinBatchChannel(name) {
    if (!Auth?.client || !name) return;
    if (this.rtChannel) {
      try { await Auth.client.removeChannel(this.rtChannel); } catch { /* */ }
      this.rtChannel = null;
    }
    this.channel = name;
    this.rtChannel = Auth.client.channel(name, { config: { broadcast: { ack: true, self: true }, presence: { key: this.nodeId || Auth.user.id } } });
    this.rtChannel.on('broadcast', { event: 'collab' }, ({ payload }) => this.onCollab(payload));
    this.rtChannel.on('presence', { event: 'sync' }, () => {
      const state = this.rtChannel.presenceState();
      const n = Object.keys(state).length;
      this.peerCount = Math.max(n, this.peerCount);
      const peerEl = document.getElementById('nb-peers');
      if (peerEl) peerEl.textContent = String(this.peerCount);
    });
    await this.rtChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await this.rtChannel.track({
          node_id: this.nodeId,
          user: AstranovSession?.isAstranov?.() ? 'ASTRANOV' : (Auth.user?.email?.split('@')[0] || 'user'),
          platform: this.platform(),
          install: this.installMode(),
        });
        this.rtChannel.send({
          type: 'broadcast',
          event: 'collab',
          payload: { type: 'hello', from: this.nodeId, batch: this.shortId },
        });
      }
    });
  },

  onCollab(payload) {
    if (!payload || payload.from === this.nodeId) return;
    if (payload.type === 'hello') {
      this.peerCount++;
      const peerEl = document.getElementById('nb-peers');
      if (peerEl) peerEl.textContent = String(this.peerCount);
      MapDepict?.pulse(this.pos().lat, this.pos().lng, 0xaa88ff, 'peer joined super batch', 8000);
      if (window.AIGraphics?.pulseBatchMesh) AIGraphics.pulseBatchMesh(this.peerCount);
      const meshSt = document.getElementById('nb-mesh-status');
      if (meshSt) meshSt.textContent = 'mesh · ' + this.peerCount + ' device(s)';
    }
    if (payload.type === 'task' && payload.text) {
      AciCli?.print('batch task · ' + payload.text.slice(0, 100), 'dim');
    }
  },

  broadcastTask(text) {
    this.rtChannel?.send({
      type: 'broadcast',
      event: 'collab',
      payload: { type: 'task', from: this.nodeId, text: String(text || '').slice(0, 300) },
    });
  },

  startHeartbeat() {
    if (this._hb) clearInterval(this._hb);
    this._hb = setInterval(async () => {
      if (!this.nodeId || !this.batchId) return;
      const pos = this.pos();
      const r = await this.api({
        action: 'heartbeat',
        node_id: this.nodeId,
        batch_id: this.batchId,
        lat: pos.lat,
        lng: pos.lng,
      });
      if (r.peers != null) {
        this.peerCount = r.peers;
        const peerEl = document.getElementById('nb-peers');
        if (peerEl) peerEl.textContent = String(r.peers);
      }
    }, 90000);
  },
};

window.AstranovNode = AstranovNode;
