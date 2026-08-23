// === ASTRANOV CODERS — always online for all users ===
// Justice → Truth → Freedom (exact order) is the immutable boundary.
var AciCoders = {
  ready: false,
  alwaysOn: true,
  teamActive: true,
  history: [],
  lastSummonId: null,
  engine: 'grok',
  armed: false,
  fallbackPrefs: { force: 'xai', skip: [] },
  _pollTimer: null,
  _listenTimer: null,
  _evolveTimer: null,
  _started: false,
  _listening: false,
  _listenBusy: false,
  _activityBuffer: [],
  _activityCount: 0,
  _listenTicks: 0,
  _lastListenAt: 0,

  CAUSE: 'Justice → Truth → Freedom',
  LISTEN_MS: 900000,
  _cliBusy: false,
  EVOLVE_MS: 600000,

  loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('aci-coders-prefs') || '{}');
      if (p.skip) this.fallbackPrefs.skip = p.skip;
      if (p.force) this.fallbackPrefs.force = p.force;
      else this.fallbackPrefs.force = 'xai';
      if (p.causeJudge) this.fallbackPrefs.causeJudge = p.causeJudge;
    } catch (_) {
      this.fallbackPrefs.force = 'xai';
    }
  },

  savePrefs() {
    try { localStorage.setItem('aci-coders-prefs', JSON.stringify(this.fallbackPrefs)); } catch (_) {}
  },

  isPowerUser() {
    return !!(Auth?.isOwner || Auth?.isArchitect);
  },

  /** Paid XAI_API_KEY path — only architect notisastranov@gmail.com after Google login */
  isArchitect() {
    const email = (Auth?.user?.email || '').toLowerCase();
    return !!(Auth?.isArchitect || email === (Auth?.OWNER_EMAIL || 'notisastranov@gmail.com').toLowerCase());
  },

  /**
   * Free tier first (OpenRouter/Groq/Gemini). Never force paid XAI from client.
   * Server uses XAI_API_KEY only after free fails — architect only + notify.
   */
  freeTierPrefs() {
    const p = { force: 'groq', skip: ['xai'] };
    if (this.fallbackPrefs?.causeJudge && this.isArchitect()) p.causeJudge = this.fallbackPrefs.causeJudge;
    return p;
  },

  isExplicitRef(raw) {
    const s = String(raw || '').trim();
    return /^(coders|composer|cursor|summon\s+coders?)\b/i.test(s) || /^@coders\b/i.test(s);
  },

  parseCauseJudge(text) {
    if (!this.isPowerUser()) return null;
    const s = String(text || '');
    if (!/priorit|judge|cause|justice|truth|freedom|δικαιοσύνη|αλήθεια|ελευθερία|κριτ|σειρά/i.test(s)) return null;
    return { ruling: s.slice(0, 500) };
  },

  loadEngine() {
    this.engine = this.fallbackPrefs.force === 'composer' ? 'composer' : 'grok';
  },

  setEngine(eng) {
    this.engine = eng === 'composer' ? 'composer' : 'grok';
    this.fallbackPrefs.force = eng === 'composer' ? 'composer' : 'xai';
    this.savePrefs();
    return true;
  },
  toggleEngine() {
    return this.setEngine(this.engine === 'composer' ? 'grok' : 'composer');
  },

  updateHud() {
    CliRibbon?.setActive?.('Coders');
    CliRibbon?.render?.();
  },

  observeActivity(source, detail, props) {
    const d = String(detail || source || '').slice(0, 120);
    if (!d) return;
    this._activityBuffer.push({ source: String(source || 'field'), detail: d, ts: Date.now(), props: props || {} });
    if (this._activityBuffer.length > 48) this._activityBuffer = this._activityBuffer.slice(-48);
    this._activityCount++;
    this.updateHud();
  },

  _buildDigest() {
    const recent = this._activityBuffer.slice(-14);
    if (!recent.length) return '';
    return recent.map(e => e.source + ':' + e.detail).join(' · ').slice(0, 1200);
  },

  startListening() {
    if (this._listenTimer) return;
    this._listening = true;
    this.updateHud();
    this._listenTimer = setInterval(() => this.listenTick(), this.LISTEN_MS);
    this._evolveTimer = setInterval(() => this.evolveTick(), this.EVOLVE_MS);
  },

  stopListening() {
    if (this._listenTimer) { clearInterval(this._listenTimer); this._listenTimer = null; }
    if (this._evolveTimer) { clearInterval(this._evolveTimer); this._evolveTimer = null; }
    this._listening = false;
  },

  async listenTick() {
    if (document.hidden) return;
    if (window._handsFreeVoice || isListening || Voice?.speaking || this._cliBusy || this._listenBusy) return;
    if (this._activityCount < 1 && this._listenTicks > 0) return;
    this._listenBusy = true;
    this._listenTicks++;
    try {
      const digest = this._buildDigest();
      const eventCount = this._activityBuffer.length;
      const evolve = eventCount >= 3 || this._listenTicks % 3 === 0;
      const r = await AciCli.api({
        mode: 'coders_listen',
        activity: digest || 'heartbeat · coders online',
        event_count: eventCount,
        evolve,
      });
      this._lastListenAt = Date.now();
      if (r.ok) this._applyListenResult(r);
    } catch (_) {
      /* retry next tick */
    } finally {
      this._listenBusy = false;
    }
  },

  _applyListenResult(r) {
    if (r.principles?.length) ACI?.syncNeuronsFromPrinciples?.(r.principles);
    if (r.evolved) {
      MapDepict?.action('evolve', { detail: 'coders listen · brain evolved' });
      ACI?.pulse?.(1.35);
      for (let i = 0; i < 2; i++) {
        ACI?.spawnNeuron?.(
          (Math.random() - 0.5) * 60,
          (Math.random() - 0.5) * 120,
          1.1 + Math.random() * 0.3,
          r.improvement?.slice(0, 80) || 'collective neuron'
        );
      }
    }
    if (r.improvement && !document.hidden) {
      GlobeDeck?.log?.('Coders · ' + r.improvement.slice(0, 160), 'dim');
    }
    this._activityBuffer = this._activityBuffer.slice(-6);
    this._activityCount = Math.max(0, this._activityCount - 2);
    this.updateHud();
  },

  async evolveTick() {
    if (window._handsFreeVoice || isListening || Voice?.speaking) return;
    if (this._activityCount < 2) return;
    try {
      await ACI?.evolve?.('coders-active-listen');
      this._activityCount = Math.max(0, this._activityCount - 3);
      this.updateHud();
    } catch (_) {}
  },

  async ensureSession() {
    if (!Auth?.user) return true;
    const session = await Auth.ensureSession?.();
    if (!session?.access_token) {
      GlobeDeck?.showError('Session expired — tap G to sign in again');
      return false;
    }
    return true;
  },

  async ensureBridge() {
    this.loadPrefs();
    this.loadEngine();
    this.alwaysOn = true;
    window._aciCodersAlwaysOn = true;
    if (this.ready) { this.updateHud(); return; }
    this.ready = true;
    window._aciCodersReady = true;
    this.updateHud();
  },

  _guaranteeReply(userMsg, r, extra) {
    const payload = { ...(r || {}), ...(extra || {}) };
    const raw = String(payload.text || payload.response || '').trim();
    if (!raw || this.isFailedReply(raw)) {
      payload.text = this.localReply(userMsg);
      payload.response = payload.text;
      payload.via = payload.via || 'local/guarantee';
    } else {
      payload.text = raw;
      payload.response = raw;
    }
    if (payload.error && !payload.text) {
      payload.text = this.localReply(userMsg) + ' (' + String(payload.error).slice(0, 100) + ')';
      payload.response = payload.text;
    }
    return this._applyResponse(payload, userMsg);
  },

  async autoStart() {
    this.alwaysOn = true;
    this.teamActive = true;
    this.armed = true;
    await this.ensureBridge();
    this.updateHud();
    if (this._started) {
      this.startListening();
      return;
    }
    this._started = true;
    window._aciCodersAlwaysOn = true;
    this.startListening();
  },

  /** Open live Coders chat — expanded CLI, replies always visible in ribbon */
  async enterSession(opts = {}) {
    opts = opts || {};
    await this.autoStart();
    if (GlobeDeck) GlobeDeck.activeTask = 'coders';
    // Default expand so replies are not hidden under collapsed deck
    const doExpand = opts.expand !== false;
    if (doExpand) {
      GlobeDeck?.onUserMessage?.('Grok');
      GlobeDeck?.expand?.('Grok');
    } else {
      GlobeDeck?.setTitle?.('Grok');
      GlobeDeck?.setPreview?.('Grok ready — type below');
    }
    CliRibbon?.setActive?.('Grok');
    AppShortcuts?.track?.('coders', 'Grok');
    if (window.AciCli) AciCli.open = true;

    const input = document.getElementById('aci-cli-in');
    if (input) {
      input.placeholder = 'Talk to Grok — type or tap 🎧 · Enter to send';
      input.classList.remove('voice-live');
      if (opts.focus !== false) {
        setTimeout(() => input.focus(), 60);
      }
    }

    // Only auto-start mic when explicitly from voice / hands-free already on
    if (opts.fromVoice || window._handsFreeVoice || voiceSessionActive) {
      if (!window._handsFreeVoice && opts.fromVoice && typeof startVoiceOptions === 'function') {
        startVoiceOptions();
      } else if (window._handsFreeVoice || voiceSessionActive) {
        scheduleVoiceResume?.();
      }
    }

    this.updateHud();

    if (!this._sessionWelcomed || opts.ping) {
      if (!this._sessionWelcomed) this._sessionWelcomed = true;
      const line = opts.ping
        ? 'Grok still here — keep talking (type or 🎧)'
        : 'Grok here — type below or tap 🎧 to speak. Replies show in the ribbon.';
      AciCli?.print(line, 'ok');
      ACIControl?.reply(line.slice(0, 200));
      CliRibbon?.setNotice?.(line.slice(0, 120), 'ready');
      GlobeDeck?.setPreview?.(line.slice(0, 120));
      if (opts.fromVoice && window._handsFreeVoice && Voice?.maySpeak?.()) {
        speak('Grok ready. Talk normally.', () => resumeListening?.(), false);
      }
    }

    return { ok: true, session: true };
  },

  /** Strip optional legacy "coders" prefix — coders listen to all messages. */
  normalizeMessage(message) {
    return String(message || '').trim()
      .replace(/^summon\s+coders?\s*/i, '')
      .replace(/^coders\s+/i, '')
      .trim();
  },

  async handleMessage(message, opts = {}) {
    const raw = (window.fixVoiceHotwords || (x => x))(String(message || '').trim());
    if (!raw) return this.enterSession({ fromVoice: !!opts.fromVoice });

    const parts = raw.split(/\s+/);
    const sub = (parts[0] || '').toLowerCase();

    if (ArchitectBridge?.wantsBridgeCmd?.(raw)) {
      const br = await ArchitectBridge.handleCommand(raw);
      if (br) return br;
    }

    if (/^coders\b/i.test(raw)) {
      if (sub === 'list') return this.listSummons();
      if (sub === 'poll' || sub === 'status') {
        const id = parts[1] ? parseInt(parts[1], 10) : this.lastSummonId;
        return this.poll(id, false);
      }
      if (sub === 'exit' || sub === 'close' || sub === 'leave') {
        AciCli?.print('Coders stay always on', 'ok');
        ACIControl?.reply('Coders always active — building the collective brain');
        return { ok: true, always_on: true };
      }
      if (sub === 'grok' || sub === 'composer') {
        const task = parts.slice(1).join(' ');
        if (task.length < 3) {
          this.setEngine(sub);
          return this.chat('use ' + sub + ' from now on');
        }
      }
      if (parts.length === 1) {
        return this.enterSession({
          ping: !!this._sessionWelcomed,
          fromVoice: !!opts.fromVoice || !!window._handsFreeVoice || !!voiceSessionActive,
        });
      }
    }

    if (this.isPowerUser() && this.isExplicitRef(raw)) {
      const task = this.normalizeMessage(raw) || raw;
      if (/^deploy\b/i.test(task)) {
        return this.executeOrder(task, raw, { deploy: true });
      }
      return this.executeOrder(task, raw);
    }

    const text = (this.normalizeMessage(raw) || raw).trim();
    if (/^coders?$/i.test(text)) {
      return this.enterSession({
        ping: !!this._sessionWelcomed,
        fromVoice: !!opts.fromVoice || !!window._handsFreeVoice || !!voiceSessionActive,
      });
    }
    return this.chat(text, opts);
  },

  async executeOrder(task, raw, opts) {
    await this.autoStart();
    if (!this.isArchitect()) {
      const msg = 'Owner orders + paid Grok are for notisastranov@gmail.com only — sign in with Google as architect';
      AciCli?.print(msg, 'err');
      ACIControl?.reply(msg);
      return { error: 'architect_only', text: msg };
    }
    if (!(await this.ensureSession())) return { error: 'session expired' };

    const judge = this.parseCauseJudge(raw);
    if (judge) {
      this.fallbackPrefs.causeJudge = judge.ruling;
      this.savePrefs();
      AciCli?.print('Cause judge ruling — architect authority', 'ok');
      try {
        await ACI?.teach?.('Architect cause judge: ' + judge.ruling);
      } catch (_) {}
    }

    const m = String(task || '').trim();
    if (!m) return { error: 'empty order' };

    AciCli?.print('OWNER ORDER — executing: ' + m.slice(0, 100), 'cmd');
    GlobeDeck?.onUserMessage('ORDER — ' + m.slice(0, 40));
    MapDepict?.action('think', { detail: 'ORDER: ' + m.slice(0, 40) });

    try {
      GlobeDeck?.setThinking(true, 'Executing owner order…');

      const r = await AciCli.api({
        mode: 'coders_chat',
        message: m,
        explicit_order: true,
        owner_judge: !!judge,
        cause_ruling: judge?.ruling || this.fallbackPrefs.causeJudge || '',
        history: this.history.slice(-10),
        fallback_prefs: this.fallbackPrefs,
      });

      const eng = this.wantsComposer(m) ? 'composer' : 'grok';
      const build = await this.queueCoder(m, eng);
      let merged = { ...r, order_executed: true };
      if (build.text && !build.error) {
        merged.text = (r.text || r.response || '') + '\n\n[ORDER #' + (build.summon_id || '?') + ']\n' + build.text;
        merged.response = merged.text;
        merged.summon_id = build.summon_id;
        merged.composer_queued = build.composer_queued;
      }

      if (opts?.deploy || /^deploy\b/i.test(m)) {
        await AciConnect?.deploy?.(m.replace(/^deploy\s*/i, ''));
      }

      GlobeDeck?.setThinking(false);
      ACIControl?.reply('Order executing — #' + (merged.summon_id || 'queued'));
      return this._applyResponse(merged, raw);
    } catch (e) {
      GlobeDeck?.setThinking(false);
      const msg = String(e.message || e);
      GlobeDeck?.showError('Order failed: ' + msg);
      return { error: msg };
    }
  },

  stopPoll() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  },

  startPoll(summonId) {
    this.stopPoll();
    if (!summonId) return;
    let tries = 0;
    this._pollTimer = setInterval(async () => {
      tries++;
      const r = await this.poll(summonId, true);
      if (r?.status === 'answered') this.stopPoll();
      if (tries > 36) {
        this.stopPoll();
        if (r?.status !== 'answered') this._pollTimeoutFallback(summonId);
      }
    }, 5000);
  },

  async _pollTimeoutFallback(summonId) {
    if (!Auth?.user) return;
    if (AciCli) AciCli.print('Composer poll timeout — asking Grok…', 'dim');
    const last = this.history.filter(h => h.role === 'user').pop();
    const task = last?.content || 'summon follow-up';
    const q = await this.queueCoder(task, 'grok');
    if (q.text && AciCli) AciCli.print('Grok fallback #' + (summonId || '?') + ': ' + q.text.slice(0, 500), 'out');
  },

  async poll(summonId, quiet) {
    const id = summonId || this.lastSummonId;
    if (!id) {
      if (!quiet && AciCli) AciCli.print('usage: coders poll <summon_id>', 'err');
      return { error: 'no id' };
    }
    const r = await AciCli.api({ mode: 'coders_poll', summon_id: id });
    if (!quiet && AciCli) {
      if (r.pending) AciCli.print('#' + id + ' pending — Composer…', 'dim');
      else if (r.text) {
        AciCli.print('Composer #' + id + ': ' + r.text.slice(0, 900), 'out');
        this._recordReply(id, r.text);
      }
    }
    if (r.text && !r.pending) {
      GlobeDeck?.expand('Coders — Composer reply');
      ACIControl?.reply('Composer #' + id + ': ' + r.text.slice(0, 160));
    }
    return r;
  },

  async listSummons() {
    if (!Auth?.user) {
      AciCli?.print('sign in with G to list your summons', 'dim');
      return { error: 'login required' };
    }
    const r = await AciCli.api({ mode: 'coders_list' });
    if (!r.summons?.length) {
      if (AciCli) AciCli.print('no coders summons yet', 'dim');
      return r;
    }
    if (AciCli) {
      AciCli.print('── coders summons ──', 'dim');
      r.summons.forEach(s => {
        AciCli.print('#' + s.id + ' [' + s.status + '] ' + s.engine + ' — ' + s.question, s.status === 'open' ? 'dim' : 'ok');
      });
    }
    return r;
  },

  _recordReply(id, text) {
    this.history.push({ role: 'assistant', content: '[#' + id + '] ' + text });
    if (this.history.length > 20) this.history = this.history.slice(-20);
  },

  _applyResponse(r, userMsg) {
    if (r.fallback_prefs) {
      this.fallbackPrefs = r.fallback_prefs;
      this.savePrefs();
      this.loadEngine();
    }
    const raw = String(r.text || r.response || '').trim();
    const err = String(r.error || '').trim();
    if (r.summon_id) this.lastSummonId = r.summon_id;

    this.history.push({ role: 'user', content: userMsg });

    const honest = raw ? this.formatHonestReply(r, userMsg) : '';
    let reply = ArcangeloDialect?.repairBrands?.(honest || raw || err) ?? (honest || raw || err);
    reply = String(reply || '').slice(0, 900);
    if (!reply || this.isFailedReply(reply)) reply = this.localReply(userMsg);
    if (err && !raw && reply === this.localReply(userMsg)) {
      reply = this.localReply(userMsg) + ' (' + err.slice(0, 120) + ')';
    }

    this.history.push({ role: 'assistant', content: reply });
    if (this.history.length > 20) this.history = this.history.slice(-20);

    // Notify architect when server switches to paid XAI_API_KEY after free limit
    if (r.paid_fallback || r.notify || /xai-paid-fallback|xai-owner/.test(String(r.via || ''))) {
      const note = String(r.paid_notice || r.notify || '⚠ Free/SuperGrok limit — using paid XAI_API_KEY');
      AciCli?.print(note, 'err');
      ACIControl?.reply(note);
      CliRibbon?.setNotice?.(note.slice(0, 120), 'err');
      try {
        if (!sessionStorage.getItem('astranov:paid-xai-notified')) {
          sessionStorage.setItem('astranov:paid-xai-notified', '1');
          if (this.isArchitect() && Voice?.maySpeak?.()) {
            speak('Paid API key activated after free limit.', () => {}, false);
          }
        }
      } catch (_) { /* */ }
    }

    const prefix = r.explicit_order || r.order_executed ? 'ORDER: ' : '';
    const kind = r.error && !raw ? 'err' : 'reply';
    const shown = prefix + reply;
    AciCli?.print(shown, kind);
    ACIControl?.reply(shown.slice(0, 260));
    // Always surface where users look (trust contract)
    GlobeDeck?.expand?.('Grok');
    GlobeDeck?.setPreview?.(shown.slice(0, 140));
    if (!(r.paid_fallback || r.notify)) {
      CliRibbon?.setNotice?.(shown.slice(0, 120), kind === 'err' ? 'err' : 'ready');
    }
    CliRibbon?.setActive?.('Grok');

    const composerQueued = r.composer_queued || (r.pending && r.summon_id);
    if (composerQueued && AciCli) AciCli.print('Composer also queued #' + composerQueued, 'dim');
    if (composerQueued) this.startPoll(composerQueued);
    else this.stopPoll();

    const spoken = ArcangeloDialect?.repairOutbound?.(reply, 'reply') ?? reply;
    if (!r.pending) {
      const wantVoice = window._handsFreeVoice || voiceSessionActive;
      if (wantVoice && Voice.shouldSpeak(spoken)) {
        voiceEnabled = true;
        speak(spoken.slice(0, 160), () => resumeListening?.(), false);
      } else if (window._handsFreeVoice || voiceSessionActive) {
        scheduleVoiceResume?.();
      }
    } else if (window._handsFreeVoice || voiceSessionActive) {
      scheduleVoiceResume?.();
    }
    GlobeDeck?.setThinking?.(false);

    this.observeActivity('chat', userMsg, { coders: true, guest: !!r.guest });
    FieldBrain?.pulse?.('think', 'coders: ' + userMsg.slice(0, 48), {
      role: Auth?.user ? 'client' : 'anon',
      props: { coders: true, guest: !!r.guest, always_on: true },
    });
    return r;
  },

  isPing(m) {
    const s = String(m || '').trim();
    if (!s || s.length > 80) return false;
    return /^(are you there|you there|hello|hi|hey|ping|online|listening|composer|grok|coders|γεια|είσαι|ακούς|παρών|εδώ|μου ακούς)/i.test(s)
      || /^(composer|grok|coders)\s+(are you there|online|there)/i.test(s);
  },

  isFailedReply(text) {
    return /gathering itself|warming up|try again in a few seconds|try again (in a moment|shortly)|no model responded/i.test(String(text || ''));
  },

  isLocalGlobeCmd(m) {
    // Strict match only — avoid voice noise triggering locate/zoom
    const s = String(m || '').trim();
    if (s.length > 48) return false;
    return /^(locate(\s+me)?|zoom\s+to\s+me|where\s+am\s+i\??|find\s+me|locate\s+button|🎯|📍)$/i.test(s);
  },

  runLocalGlobeCmd(m) {
    if (!this.isLocalGlobeCmd(m)) return null;
    GlobeDeck?.setThinking(false);
    locateMe?.();
    const pos = window._lastPos;
    const hint = pos
      ? 'On globe · ' + pos.lat.toFixed(2) + ', ' + pos.lng.toFixed(2) + ' — zoom in or say city view'
      : 'Locating you on the globe…';
    AciCli?.print(hint, 'ok');
    ACIControl?.reply(hint);
    CliRibbon?.setNotice?.('located', 'ready');
    return { ok: true, located: true, text: hint };
  },

  localReply(m) {
    const greek = /[\u0370-\u03FF]/.test(String(m || ''));
    if (this.isPing(m)) {
      return greek
        ? 'Ναι, είμαι εδώ — Grok online. Μίλα κανονικά ή πάτα 🎧.'
        : 'Yes — Grok here. Talk straight to me — type or tap 🎧.';
    }
    return greek
      ? 'Grok εδώ — δοκίμασε ξανά ή πάτα 🎧 να μιλήσεις.'
      : 'Grok here — say it again or tap 🎧 to talk.';
  },

  isBuildTask(m) {
    const s = String(m || '').toLowerCase();
    if (/^(why|what|how|do we|list|status|credits|explain|try|skip|use)\b/.test(s)) return false;
    return /fix|build|implement|add|create|remove|button|locate|globe|vendor|order|mobile|lag|hang|slow|broken|crash|φτιάξε|πρόσθεσε|διόρθωσε|κολλάει/.test(s) && s.length >= 6;
  },

  isCodersIntent(m) {
    const s = String(m || '').trim();
    if (this.isExplicitRef(s)) return true;
    return this.isBuildTask(s) || /call\s+coders?|ask\s+coders?|tell\s+coders?/i.test(s);
  },

  tryLocalFix(m) {
    const low = String(m || '').toLowerCase();
    if ((/cli|input|voice|transcri|compose|lag|hang|slow/.test(low)) && /fix|clear|reset|φτιάξε|διόρθωσε/.test(low)) {
      GlobeDeck?.setCompose?.('');
      window.setVoicePerfMode?.(true);
      const input = document.getElementById('aci-cli-in');
      if (input) {
        input.classList.remove('voice-live');
        window.resizeCliInput?.(input);
        input.focus();
      }
      AciCoders._cliBusy = false;
      return 'CLI reset · perf mode on — edit the input or speak again';
    }
    if ((/vendor|shop|καταστήμα|driver|οδηγ/.test(low)) && /fix|find|show|list|scan|βρες/.test(low)) {
      window.Commerce?.openOrderFlow?.('');
      return 'Vendor scan opened on globe — pick shop or say order pitogyra';
    }
    if (/locate|zoom|map|πόσο|where am i/.test(low)) {
      this.runLocalGlobeCmd('locate me');
      return 'Located on globe';
    }
    if (/refresh|reload|συγχρον/.test(low) && /app|globe|page/.test(low)) {
      YachtMatcher?.loadAndSyncGlobe?.();
      window.Commerce?.loadVendors?.();
      AuditorPortal?.syncGlobe?.();
      return 'Globe data refreshed — yachts · vendors · drivers · auditors';
    }
    if (/^(use\s+)?(openai|gpt|groq|gemini|deepseek|deep\s*seek|cycle|astranov)\b/i.test(low)) {
      const prov = /openai|gpt/.test(low) ? 'openai-mini'
        : /groq/.test(low) ? 'groq'
        : /gemini/.test(low) ? 'gemini'
        : /deep/.test(low) ? 'deepseek'
        : 'astranov';
      AiRouter?.setProvider?.(prov);
      LabOrbs?._syncGlyphs?.();
      return 'AI provider → ' + (AiRouter.current()?.label || prov);
    }
    if (/^summon\s+composer|^use\s+composer|^queue\s+composer/i.test(low)) {
      void CodersHub?.summonComposer?.();
      return 'Summoning Composer on your saved job…';
    }
    if (/coders?\s*hub|coder\s*labs?|ai\s*teams?|open\s*coders?|labs?\s*race|ανταγωνισμ|ομάδες/.test(low)) {
      CodersHub?.toggle?.(true);
      return 'Coders Hub open — ' + (CodersHub?.LABS?.length || 0) + ' AI teams racing on subdomains';
    }
    if (/city\s*view|zoom\s*in|shops|καταστήμα/.test(low)) {
      enterCityView?.();
      return 'City view — vendors and drivers on map';
    }
    if (/theme|bright|dark|φωτειν|σκοτειν/.test(low)) {
      const mode = /bright|light|φωτειν/.test(low) ? 'bright' : 'dark';
      AstranovTheme?.set?.(mode);
      return 'Theme → ' + mode;
    }
    if (/yacht|charter|booker|ενοικ/.test(low) && /open|list|show|άνοιξε|δείξε/.test(low)) {
      YachtMatcher?.openBooking?.(null, { tab: 'booker' });
      return 'Opened yachts.astranov.eu Booker';
    }
    if (/audit|invoice|accountant|λογιστ/.test(low)) {
      AuditorPortal?.open?.({ tab: 'dashboard' });
      return 'Opened auditors.astranov.eu';
    }
    if (/Coins|coin|ledger|justice|wallet|κρυπτο|νόμισμα/.test(low) && /balance|ledger|open|show|wallet|δείξε/.test(low)) {
      if (/open|wallet|show|δείξε/.test(low)) CoinPortal?.open?.(/ledger|transparen/.test(low) ? 'transparency' : 'wallet');
      else CoinsJustice?.cli?.(['Coins', /ledger|διαφάν|transparen/.test(low) ? 'ledger' : 'balance']);
      return 'coin.astranov.eu — Coins wallet · 1 Coin = 1 EUR · work-mint only';
    }
    return null;
  },

  formatHonestReply(r, userMsg) {
    const text = String(r.text || r.response || '').trim();
    if (!text) return '';
    const id = r.summon_id || r.composer_queued || r.bridge_id;
    if (id && this.isBuildTask(userMsg)) {
      const stripped = text.replace(/\b(done|fixed|implemented|completed|applied)\b/gi, '').trim();
      const agent = r.bridge ? 'Grok Build (Architect Bridge)' : 'desktop agent';
      return (stripped ? stripped.slice(0, 280) + '\n\n' : '')
        + 'Build queued #' + id + ' — ' + agent + '. Stay in app; reply lands here. bridge poll ' + id;
    }
    return text;
  },

  wantsComposer(m) {
    return this.fallbackPrefs.force === 'composer'
      || /^use\s+composer|queue\s+composer|summon\s+composer|back\s+to\s+composer/i.test(String(m || ''));
  },

  async queueCoder(task, engine) {
    if (!Auth?.user) return { error: 'sign in with G for build queue' };
    // Build / paid Grok queue — architect only
    if (!this.isArchitect() && (engine === 'composer' || this.isBuildTask(task))) {
      return { error: 'architect_only', text: 'Build queue is owner-only — sign in as notisastranov@gmail.com' };
    }
    const eng = engine || (this.wantsComposer(task) ? 'composer' : 'grok');
    const q = await AciCli.api({
      mode: 'coders',
      task: task,
      coder_engine: eng,
      history: this.history.slice(-6),
      fallback_prefs: this.freeTierPrefs(),
    });
    if (q.error && AciCli) AciCli.print('coders error: ' + q.error, 'err');
    if (q.paid_fallback || q.notify) this._applyResponse(q, task);
    if (q.summon_id) {
      this.lastSummonId = q.summon_id;
      if (q.composer_queued) this.startPoll(q.composer_queued);
    }
    return q;
  },

  async chat(message, opts = {}) {
    const m = String((window.fixVoiceHotwords || (x => x))(String(message || ''))).trim();
    if (m.length < 1) return this.enterSession({ fromVoice: !!opts.fromVoice });

    // Rebuild path: Core Brain owns freeform + globe tools (local-first, <14s AI)
    if (window.AstranovCoreBrain?.handle && !opts.forceLegacy && !this.wantsComposer(m)
      && !ArchitectBridge?.wantsBridgeCmd?.(m) && !this.isExplicitRef(m)) {
      return AstranovCoreBrain.handle(m, opts);
    }

    const localFix = this.tryLocalFix(m);
    if (localFix) {
      AciCli?.print(localFix, 'ok');
      ACIControl?.reply(localFix.slice(0, 260));
      if (Auth?.user && this.isBuildTask(m)) {
        if (this.isArchitect() && !this.wantsComposer(m)) {
          const br = await ArchitectBridge?.queueBuildFromChat?.(m, { kind: 'fix' }).catch(() => null);
          if (br?.summon_id) AciCli?.print('Also Bridge #' + br.summon_id + ' → Grok Build', 'dim');
        } else {
          const q = await this.queueCoder(m, 'grok').catch(() => ({}));
          if (q.summon_id) AciCli?.print('Also queued #' + q.summon_id + ' for desktop agent', 'dim');
        }
      }
      if (opts.fromVoice || window._handsFreeVoice) scheduleVoiceResume?.();
      return { ok: true, local: true, text: localFix };
    }

    const localGlobe = this.runLocalGlobeCmd(m);
    if (localGlobe) {
      GlobeDeck?.setThinking(false);
      return localGlobe;
    }
    if (AstranovPresence?.wantsKryftoStart?.(m)) {
      GlobeDeck?.setThinking(false);
      AstranovPresence?.startKryfto?.();
      return { ok: true, game: 'kryfto' };
    }
    if (TelemachosPilot?.wantsCmd?.(m)) {
      GlobeDeck?.setThinking(false);
      await TelemachosPilot.cli([], m);
      return { ok: true, pilot: 'telemachos' };
    }
    if (/yacht|charter|crew|captain|match|ενοικ|supply|demand|field\s+\w+/.test(m.toLowerCase())) {
      const ev = await YachtMatcher?.evolveFromText?.(m);
      if (ev?.best) {
        GlobeDeck?.setThinking(false);
        const msg = YachtMatcher?.formatMatch?.(ev.best) || '';
        ACIControl?.reply(msg);
        return { ok: true, yacht: ev };
      }
      if (/field|parameter|develop/.test(m.toLowerCase())) {
        this.observeActivity('field_evolve', m.slice(0, 100), {});
      }
    }
    if (/hellenic|ξενία|arete|logos|μῆτις|καιρός/i.test(m)) {
      HellenicSource?.groundCoders?.(m);
    }

    await this.enterSession({
      focus: false,
      fromVoice: !!opts.fromVoice || !!window._handsFreeVoice || !!voiceSessionActive,
    });

    if (Auth?.user && !(await this.ensureSession())) {
      return this._guaranteeReply(m, { error: 'session expired', text: 'Session expired — tap G to sign in again.' });
    }

    const build = this.isBuildTask(m);
    const fast = (!build && !this.wantsComposer(m)) || m.length < 600;
    if (!fast) MapDepict?.action('think', { detail: 'coders: ' + m.slice(0, 40) });

    this._cliBusy = true;
    if (this._chatWatchdog) clearTimeout(this._chatWatchdog);
    this._chatWatchdog = setTimeout(() => {
      this._cliBusy = false;
      GlobeDeck?.setThinking?.(false);
    }, 55000);
    try {
      GlobeDeck?.setThinking(true, 'Grok…');
      if (/^city\s*(view|level|map)?$/i.test(m.trim())) {
        const city = await Promise.race([
          enterCityView?.(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('city view timeout')), 22000)),
        ]).catch(e => ({ error: String(e.message || e) }));
        const shops = city?.vendors?.length ?? 0;
        const msg = city?.error
          ? 'City view failed — ' + city.error + '. Try locate first.'
          : 'City map open — ' + shops + ' shops nearby. Tap a pin or type order.';
        return this._guaranteeReply(m, { text: msg, via: 'local/city' });
      }

      // Architect + build: primary path is Architect Bridge → Grok Build desktop (in-app coding)
      if (this.isArchitect() && build && !this.wantsComposer(m)) {
        const br = await ArchitectBridge?.queueBuildFromChat?.(m, { kind: 'fix' }).catch(() => null);
        if (br?.summon_id) {
          // Still give a short Grok chat ack so phone feels live
          let ack = '';
          try {
            const gr = await AciCli.api({
              mode: 'coders_chat',
              message: 'Confirm you queued this street fix for Grok Build (one short sentence): ' + m.slice(0, 400),
              fast: true,
              history: this.history.slice(-4),
              fallback_prefs: this.freeTierPrefs(),
            }, { timeoutMs: 18000 });
            ack = String(gr.text || gr.response || '').trim();
          } catch (_) { /* */ }
          const text = (ack && !this.isFailedReply(ack) ? ack + '\n\n' : '')
            + 'Bridge #' + br.summon_id + ' → Grok Build. Stay in the app — answer returns here.';
          GlobeDeck?.setThinking(false);
          return this._applyResponse({
            text,
            response: text,
            summon_id: br.summon_id,
            bridge: true,
            bridge_id: br.summon_id,
            via: 'architect_bridge',
            team: true,
          }, m);
        }
      }

      if (Auth?.user && this.wantsComposer(m) && build) {
        const q = await this.queueCoder(m, 'composer');
        GlobeDeck?.setThinking(false);
        if (q.text && !q.error) {
          return this._applyResponse({ ...q, label: q.label || 'Astranov Coders', team: true }, m);
        }
      }

      if (this.isPing(m)) {
        void AciCli.api({
          mode: 'coders_chat',
          message: m,
          fast: true,
          history: this.history.slice(-4),
          fallback_prefs: this.fallbackPrefs,
        }, { timeoutMs: 12000 }).catch(() => {});
        GlobeDeck?.setThinking(false);
        const pingReply = this.localReply(m);
        if (window._handsFreeVoice && Voice?.shouldSpeak?.(pingReply)) {
          speak(pingReply.slice(0, 100), () => resumeListening?.(), false);
        }
        return this._applyResponse({ text: pingReply, via: 'local/ping' }, m);
      }

      // Free tier first — server may paid-fallback for architect only after limit
      const grokPrefs = this.freeTierPrefs();
      let r = await AciCli.api({
        mode: 'coders_chat',
        message: m,
        fast: true,
        history: this.history.slice(-8),
        fallback_prefs: grokPrefs,
      }, { timeoutMs: GlobeDeck?._isMobileDeck?.() ? 32000 : 38000 });

      let text = String(r.text || r.response || '').trim();
      if (this.isFailedReply(text)) text = '';
      if (r.error || !text) {
        const fb = await AciCli.api({
          mode: 'coders',
          task: m,
          coder_engine: 'fallback',
          fallback: true,
          fallback_prefs: { force: 'groq', skip: ['xai'] },
          history: this.history.slice(-4),
        }, { timeoutMs: 22000 });
        const fbText = String(fb.text || fb.response || '').trim();
        if (fbText && !this.isFailedReply(fbText)) {
          GlobeDeck?.setThinking(false);
          return this._applyResponse({ ...fb, text: fbText, team: true, via: fb.via || 'coder/groq' }, m);
        }
        if (Auth?.user && build) {
          const q = await this.queueCoder(m, 'grok');
          if (q.text && !q.error && !this.isFailedReply(q.text)) {
            GlobeDeck?.setThinking(false);
            return this._applyResponse({ ...q, text: q.text, team: true }, m);
          }
        }
        if (r.error && !text) {
          GlobeDeck?.setThinking(false);
          return this._applyResponse({ text: this.localReply(m), via: 'local/fallback' }, m);
        }
        text = this.localReply(m);
        r = { ...r, text, response: text, via: 'local' };
      }

      if (Auth?.user && build && !r.summon_id) {
        // Prefer Architect Bridge for architect (Grok Build); Composer only when forced
        if (this.isArchitect() && !this.wantsComposer(m)) {
          const br = await ArchitectBridge?.queueBuildFromChat?.(m, { kind: 'fix' }).catch(() => null);
          if (br?.summon_id) {
            r.summon_id = br.summon_id;
            r.bridge = true;
            r.bridge_id = br.summon_id;
            const note = 'Bridge #' + br.summon_id + ' → Grok Build (desktop). Reply returns in this chat.';
            r.text = (r.text ? r.text + '\n\n' : '') + note;
            r.response = r.text;
          }
        } else {
          const q = await this.queueCoder(m, this.wantsComposer(m) ? 'composer' : 'grok');
          if (q.summon_id) {
            r.summon_id = q.summon_id;
            r.composer_queued = q.composer_queued;
            if (!r.text && q.text) { r.text = q.text; r.response = q.text; }
          }
        }
      }

      return this._guaranteeReply(m, r);
    } catch (e) {
      const msg = String(e.message || e);
      GlobeDeck?.showError('Coders failed: ' + msg);
      if (Auth?.user && build) {
        const q = await this.queueCoder(m, 'grok').catch(() => ({}));
        if (q.text) return this._guaranteeReply(m, { ...q, team: true });
      }
      return this._guaranteeReply(m, { error: msg, via: 'local/error' });
    } finally {
      if (this._chatWatchdog) { clearTimeout(this._chatWatchdog); this._chatWatchdog = null; }
      this._cliBusy = false;
      GlobeDeck?.setThinking?.(false);
    }
  },

  async handleCodersCommand(rest, opts = {}) {
    const msg = String(rest || '').trim();
    if (!msg || /^coders?$/i.test(msg)) {
      return this.enterSession({
        ping: !!this._sessionWelcomed,
        fromVoice: !!opts.fromVoice || !!window._handsFreeVoice || !!voiceSessionActive,
      });
    }
    return this.handleMessage(msg, opts);
  },

  async openTeam(intro) {
    await this.autoStart();
    const msg = intro && intro.trim().length > 0 ? intro.trim() : 'online';
    return this.chat(msg);
  },

  async summon(task) {
    return this.chat(task);
  },
};
window.AciCoders = AciCoders;
