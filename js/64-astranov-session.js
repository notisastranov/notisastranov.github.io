// === ASTRANOV SESSION — one user, one cloud session, no local copies ===
const COLLECTIVE_SESSION_NAME = 'ASTRANOV COLLECTIVE INTELLIGENCE';
const COLLECTIVE_BATCH_SHORT_ID = 'ACI';

const AstranovSession = {
  CLOUD_ONLY: true,
  SESSION_NAME: COLLECTIVE_SESSION_NAME,
  BATCH_SHORT_ID: COLLECTIVE_BATCH_SHORT_ID,
  _deviceId: null,
  _syncTimer: null,
  _lastPull: 0,
  _lastRemote: null,

  init() {
    this._deviceId = this._deriveDeviceId();
    this._applyIdentity();
    if (Auth?.client) {
      Auth.client.auth.onAuthStateChange(() => this.onAuth());
    }
    setTimeout(() => this.onAuth(), 600);
    setTimeout(() => this.guardCollective(), 1800);
    this._syncTimer = setInterval(() => this.push(), 45000);
    this._guardTimer = setInterval(() => {
      if (Auth?.user && this.isAstranov()) this.guardCollective();
    }, 90000);
    window.addEventListener('beforeunload', () => this.push(true));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Auth?.user && this.isAstranov()) this.guardCollective();
    });
  },

  async guardCollective() {
    if (!Auth?.user || !this.isAstranov()) return;
    this.purgeAllLocalState();
    await this.unifyCollective();
  },

  _deriveDeviceId() {
    if (this._lastRemote?.deviceId) return this._lastRemote.deviceId;
    if (Auth?.user?.id) {
      const ua = (navigator.userAgent || 'web').slice(0, 20);
      let h = 0;
      for (let i = 0; i < ua.length; i++) h = ((h << 5) - h + ua.charCodeAt(i)) | 0;
      return 'dev-' + Auth.user.id.slice(0, 8) + '-' + Math.abs(h).toString(36).slice(0, 6);
    }
    return 'dev-guest-' + Math.random().toString(36).slice(2, 8);
  },

  deviceId() {
    return this._deviceId || this._deriveDeviceId();
  },

  isAstranov() {
    if (!Auth?.user) return false;
    const email = (Auth.user.email || '').toLowerCase();
    const owner = (Auth.OWNER_EMAIL || 'notisastranov@gmail.com').toLowerCase();
    return email === owner || !!Auth.isOwner || !!Auth.isArchitect;
  },

  sessionLabel() {
    return this.SESSION_NAME;
  },

  identity() {
    if (Auth?.user?.id) {
      const isAstranov = this.isAstranov();
      const name = isAstranov ? 'ASTRANOV' : (
        Auth.user.user_metadata?.full_name
        || Auth.user.user_metadata?.name
        || (Auth.user.email || '').split('@')[0]
        || 'User'
      );
      return {
        userId: Auth.user.id,
        name,
        deviceId: this.deviceId(),
        isGuest: false,
        isAstranov,
        isOwner: isAstranov,
        email: Auth.user.email,
        sessionName: this.SESSION_NAME,
        batchShortId: this.BATCH_SHORT_ID,
      };
    }
    return {
      userId: 'guest-' + this.deviceId(),
      name: 'Guest',
      deviceId: this.deviceId(),
      isGuest: true,
      sessionName: this.SESSION_NAME,
      batchShortId: this.BATCH_SHORT_ID,
    };
  },

  purgeAllLocalState() {
    try {
      const keep = ContextTruth?.AUTH_KEEP || new Set(['astranov_auth_v2']);
      const drop = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || keep.has(k)) continue;
        if (k.startsWith('astranov_')) drop.push(k);
        if (k.startsWith('aci-')) drop.push(k);
      }
      drop.forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  },

  async unifyCollective() {
    if (Auth?.whenReady) await Auth.whenReady();
    if (!Auth?.user) return;
    this._applyIdentity();
    this.purgeAllLocalState();
    SessionHold?.clearForeignHold?.();
    if (AstranovNode?.api) {
      try {
        const r = await AstranovNode.api({ action: 'session_purge' });
        if (r.ok && r.closed > 0) {
          AciCli?.print?.('◎ Closed ' + r.closed + ' old session(s) — cloud collective only', 'dim');
        }
      } catch (_) {}
    }
    AstranovPresence?.refresh?.();
    await this.pull();
    await AstranovNode?.resumeSession?.();
    await this.push(true);
    GlobeDeck?.setTitle?.(this.SESSION_NAME);
    const chip = document.getElementById('user-chip');
    if (chip && this.isAstranov()) chip.textContent = 'ASTRANOV · OWNER';
  },

  getDeviceNodeId() {
    if (!Auth?.user?.id) return null;
    return 'node-' + Auth.user.id.slice(0, 8) + '-' + this.deviceId().slice(0, 10);
  },

  _applyIdentity() {
    const id = this.identity();
    if (typeof me !== 'undefined') {
      if (!me) window.me = me = {};
      me.id = id.userId;
      me.name = id.name;
      me.deviceId = id.deviceId;
      me.isGuest = id.isGuest;
      me.isAstranov = !!id.isAstranov;
      if (id.email) me.email = id.email;
      if (id.isAstranov) me.sessionName = this.SESSION_NAME;
    }
    window._astranovIdentity = id;
  },

  capture() {
    return {
      userId: Auth?.user?.id || null,
      deviceId: this.deviceId(),
      sessionName: this.SESSION_NAME,
      cloudOnly: true,
      updatedAt: Date.now(),
      lastPos: window._lastPos || null,
      batchId: AstranovNode?.batchId || null,
      shortId: this.BATCH_SHORT_ID,
      batchLabel: this.SESSION_NAME,
      nodeId: AstranovNode?.nodeId || this.getDeviceNodeId(),
      theme: AstranovTheme?.mode || 'dark',
      followMode: GlobeControl?.followMode || 'free',
      deckExpanded: !!GlobeDeck?.expanded,
      activeTask: GlobeDeck?.activeTask || null,
      context: SuperCli?._context || 'idle',
      handsFree: !!window._handsFreeVoice,
      wishlist: AstranovWishlist?.snapshot?.() || [],
      cliHistory: AciCli?.history?.slice?.(-40) || [],
    };
  },

  applyRemote(session) {
    if (!session || typeof session !== 'object') return;
    session.shortId = this.BATCH_SHORT_ID;
    session.sessionName = this.SESSION_NAME;
    session.batchLabel = this.SESSION_NAME;
    this._lastRemote = session;
    if (session.deviceId) this._deviceId = session.deviceId;
    if (session.lastPos?.lat != null) {
      window._lastPos = session.lastPos;
      placeMe?.(session.lastPos.lat, session.lastPos.lng, { quiet: true, markerOnly: true });
    }
    if (session.theme && AstranovTheme?.set) AstranovTheme.set(session.theme);
    if (session.shortId && AstranovNode?.resumeFromServer) {
      AstranovNode.resumeFromServer(session);
    }
    if (session.wishlist?.length && AstranovWishlist?.applyRemote) {
      AstranovWishlist.applyRemote(session.wishlist);
    }
    if (session.cliHistory?.length && AciCli?.mergeHistory) {
      AciCli.mergeHistory(session.cliHistory);
    }
    if (session.handsFree && !SessionHold?.isHeld?.()) {
      window._handsFreeVoice = true;
      voiceSessionActive = true;
      voiceEnabled = true;
      setTimeout(() => scheduleVoiceResume?.(), 1200);
    }
    window.dispatchEvent(new CustomEvent('astranov-session-pulled', { detail: session }));
  },

  async onAuth() {
    if (this.isAstranov()) this.purgeAllLocalState();
    this._deviceId = this._deriveDeviceId();
    this._applyIdentity();
    if (Auth?.user) {
      if (this.isAstranov()) {
        await this.unifyCollective();
      } else {
        SessionHold?.clearForeignHold?.();
        await this.pull();
        await AstranovNode?.resumeSession?.();
      }
      setTimeout(() => AstranovWishlist?.announceRecovered?.(), 900);
      if (this.isAstranov()) {
        GlobeDeck?.setTitle?.(this.SESSION_NAME);
        const chip = document.getElementById('user-chip');
        if (chip) {
          chip.textContent = 'ASTRANOV · OWNER';
          chip.style.color = '#00dd77';
        }
      }
    }
    if (window._lastPos && GlobeEntity?.syncMe) {
      GlobeEntity.syncMe(_lastPos.lat, _lastPos.lng, me?.name || 'You');
    }
    AstranovPresence?.refresh?.();
  },

  async pull() {
    if (!Auth?.user || !AstranovNode?.api) return;
    if (Date.now() - this._lastPull < 8000) return;
    this._lastPull = Date.now();
    try {
      const r = await AstranovNode.api({ action: 'session_get' });
      if (r.ok && r.session) this.applyRemote(r.session);
    } catch (e) {
      console.warn('[AstranovSession] pull failed', e.message || e);
    }
  },

  async push(force) {
    if (!Auth?.user || !AstranovNode?.api) return;
    if (!force && document.hidden) return;
    try {
      await AstranovNode.api({ action: 'session_save', session: this.capture() });
    } catch (_) {}
  },
};
window.AstranovSession = AstranovSession;
