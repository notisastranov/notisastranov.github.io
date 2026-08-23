// === SESSION HOLD — pause mic/tasks in noisy places, resume later ===
// Prefer phase bridge / critical stub; never redeclare with let (co-bundle safe)
sessionHeld = false;
window.sessionHeld = false;

var SessionHold = {
  STORAGE_KEY: 'astranov-session-hold-v1',
  _snapshot: null,

  storageKey() {
    const uid = Auth?.user?.id || 'guest';
    return this.STORAGE_KEY + '_' + uid;
  },

  clearForeignHold() {
    const saved = this.loadPersisted();
    if (!saved?.snapshot) return;
    const cur = Auth?.user?.id || null;
    if (saved.snapshot.userId && cur && saved.snapshot.userId !== cur) {
      this.release();
      AciCli?.print('cleared hold from another account — same login on all devices', 'dim');
    }
  },

  init() {
    const btn = document.getElementById('aci-hold');
    if (btn) btn.onclick = e => { e.preventDefault(); e.stopPropagation(); this.toggle(); };
    this.restoreIfNeeded();
    this.syncButton();
  },

  isHeld() { return sessionHeld; },

  capture() {
    const input = document.getElementById('aci-cli-in');
    return {
      savedAt: Date.now(),
      voiceSessionActive: !!voiceSessionActive,
      voiceEnabled: !!voiceEnabled,
      deckExpanded: !!GlobeDeck?.expanded,
      activeTask: GlobeDeck?.activeTask || null,
      deckTitle: document.getElementById('globe-deck-title')?.textContent || '',
      inputBuffer: input?.value || AciCli?.buffer || '',
      context: SuperCli?._context || 'idle',
      followMode: GlobeControl?.followMode || null,
      batchId: window.AstranovNode?.batchId || null,
      vhfActive: !!window.Comms?.vhfActive,
      driving: !!window.DrivingView?.active,
      userId: Auth?.user?.id || null,
    };
  },

  persist(snapshot) {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify({ held: true, snapshot }));
    } catch (_) {}
  },

  clearPersist() {
    try { localStorage.removeItem(this.storageKey()); } catch (_) {}
  },

  pauseListening() {
    if (recognition) { try { recognition.stop(); } catch (_) {} }
    isListening = false;
    Voice?.flush?.();
  },

  hold(opts = {}) {
    if (sessionHeld) return;
    const snap = this.capture();
    this._snapshot = snap;
    sessionHeld = true;
    this.pauseListening();
    this.persist(snap);
    this.syncButton();
    const deck = GlobeDeck?.deck?.();
    if (deck) deck.classList.add('session-held');
    const input = document.getElementById('aci-cli-in');
    if (input) input.placeholder = '⏸ held — tap ▶ to resume';
    GlobeDeck?.setPreview('⏸ Session held — mic & tasks paused');
    AciCli?.print('⏸ Session held — leave noisy area, tap ▶ to resume', 'dim');
    if (!opts.quiet) ACIControl?.reply('Held — tap ▶ when ready to resume');
    SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
  },

  async resume(opts = {}) {
    if (!sessionHeld) return;
    const snap = this._snapshot || this.loadPersisted()?.snapshot;
    sessionHeld = false;
    this.syncButton();
    const deck = GlobeDeck?.deck?.();
    if (deck) deck.classList.remove('session-held');
    const input = document.getElementById('aci-cli-in');
    if (input) input.placeholder = 'type or tap 🎤 · Enter or ➡';

    if (snap) {
      if (snap.deckExpanded) GlobeDeck?.expand(snap.deckTitle || PublicCopy?.deckTitle?.() || 'Astranov');
      if (snap.activeTask) GlobeDeck.activeTask = snap.activeTask;
      if (snap.inputBuffer && input) {
        input.value = snap.inputBuffer;
        if (AciCli) AciCli.buffer = snap.inputBuffer;
      }
      if (snap.context) SuperCli?.setContext?.(snap.context);
      if (snap.voiceSessionActive || snap.voiceEnabled) {
        voiceSessionActive = true;
        voiceEnabled = true;
      }
      if (window.AciCli) AciCli.open = !!snap.deckExpanded;
    }

    this.clearPersist();
    this._snapshot = null;
    AciCli?.print('▶ Session resumed', 'ok');
    GlobeDeck?.setPreview('▶ Resumed');
    if (!opts.quiet) ACIControl?.reply('Resumed — ready');

    if (snap?.voiceSessionActive || snap?.voiceEnabled) {
      setTimeout(() => startVoiceOptions?.(), 400);
    } else {
      scheduleVoiceResume?.();
    }
    SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
  },

  loadPersisted() {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  },

  restoreIfNeeded() {
    const saved = this.loadPersisted();
    if (!saved?.held || !saved.snapshot) return;
    this._snapshot = saved.snapshot;
    sessionHeld = true;
    voiceSessionActive = false;
    voiceEnabled = false;
    this.pauseListening();
    this.syncButton();
    const deck = GlobeDeck?.deck?.();
    if (deck) deck.classList.add('session-held');
    const input = document.getElementById('aci-cli-in');
    if (input) input.placeholder = '⏸ held — tap ▶ to resume';
    if (saved.snapshot.deckTitle) GlobeDeck?.setTitle(saved.snapshot.deckTitle);
    GlobeDeck?.setPreview('⏸ Session held — tap ▶ to resume');
    setTimeout(() => {
      AciCli?.print('⏸ Restored held session — tap ▶ to resume', 'dim');
    }, 600);
  },

  release() {
    sessionHeld = false;
    this._snapshot = null;
    this.clearPersist();
    this.pauseListening();
    this.syncButton();
    const deck = GlobeDeck?.deck?.();
    if (deck) deck.classList.remove('session-held');
    const input = document.getElementById('aci-cli-in');
    if (input) input.placeholder = 'type or tap 🎤 · Enter or ➡';
  },

  toggle() {
    if (sessionHeld) this.resume();
    else this.hold();
  },

  syncButton() {
    const btn = document.getElementById('aci-hold');
    if (!btn) return;
    if (sessionHeld) {
      btn.textContent = '▶';
      btn.title = 'Resume session — restore mic & tasks';
      btn.classList.add('deck-btn-active');
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.textContent = '⏸';
      btn.title = 'Hold session — pause mic & tasks for noisy places';
      btn.classList.remove('deck-btn-active');
      btn.setAttribute('aria-pressed', 'false');
    }
  },
};
window.SessionHold = SessionHold;
// Keep lexical alias in sync for modules that captured the stub name
try { if (typeof globalThis !== 'undefined') globalThis.SessionHold = SessionHold; } catch (_) {}
