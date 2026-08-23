// === ARCHITECT BRIDGE — phone street-fix → desktop Grok Build agent ===
// Owner only: notisastranov@gmail.com after Google sign-in on astranov.eu
// In-app coding path: fix | dev | code | edit | bridge → cic_queue reason architect_bridge
// Desktop: npm run bridge-watch  ·  answer: node scripts/architect-bridge-answer.mjs <id> "…"
var ArchitectBridge = {
  armed: false,
  lastTaskId: null,
  _pollTimer: null,
  _watchIds: new Set(),
  _delivered: new Set(),
  BRIDGE_URL: null,

  bridgeUrl() {
    if (this.BRIDGE_URL) return this.BRIDGE_URL;
    const fn = typeof resolveAstranovFunctionsUrl === 'function'
      ? resolveAstranovFunctionsUrl()
      : (SB_URL + '/functions/v1');
    this.BRIDGE_URL = fn + '/coders-bridge';
    return this.BRIDGE_URL;
  },

  isActive() {
    return !!(Auth?.isArchitect || AciCoders?.isArchitect?.());
  },

  fieldContext() {
    const pos = window._lastPos || null;
    let build = '';
    try { build = document.querySelector('meta[name="astranov-build"]')?.content || ''; } catch (_) { /* */ }
    return {
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      build,
      page: location.pathname + location.search,
      active_task: GlobeDeck?.activeTask || 'idle',
      ua: navigator.userAgent?.slice(0, 120) || '',
      engine: 'grok_build',
    };
  },

  async api(body) {
    const headers = await Auth.authHeaders();
    return fetchJson(this.bridgeUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {}),
    }, 28000);
  },

  init() {
    if (this._inited) return;
    this._inited = true;
    this._bindUi();
    if (this.isActive()) this.arm({ quiet: true });
  },

  _bindUi() {
    const btn = document.getElementById('aci-bridge');
    if (!btn || btn._bridgeBound) return;
    btn._bridgeBound = true;
    btn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      void this.openQuickFix();
    };
  },

  openQuickFix() {
    if (!Auth?.user) {
      Auth?.openLoginModal?.('Sign in as architect to use dev bridge');
      return;
    }
    if (!this.isActive()) {
      ACIControl?.reply('Dev bridge is architect-only — sign in as notisastranov@gmail.com');
      return;
    }
    this.arm({ quiet: true });
    GlobeDeck?.expand?.('Bridge — code from the street');
    GlobeDeck.activeTask = 'coders';
    CliRibbon?.setActive?.('Bridge');
    CliRibbon?.setNotice?.('Bridge · fix · code · dev', 'ready');
    const input = document.getElementById('aci-cli-in');
    if (input) {
      input.value = 'fix ';
      input.placeholder = 'fix … · code … · dev … — Grok Build on desktop';
      input.focus();
      try { input.setSelectionRange(4, 4); } catch (_) { /* */ }
      window.resizeCliInput?.(input);
    }
    ACIControl?.reply('🛠 Bridge armed — type fix/code/dev or speak after 🎧');
    AciCli?.print('Bridge ready — Grok Build picks up on desktop. Commands: fix | code | dev | bridge status', 'ok');
  },

  arm(opts = {}) {
    if (!this.isActive()) return { error: 'architect_only' };
    this.armed = true;
    window._architectBridgeArmed = true;
    this.startWatch();
    if (!opts.quiet) {
      AciCli?.print('Bridge armed — fix/code/dev reach Grok Build (in-app → desktop)', 'ok');
      ACIControl?.reply('Bridge armed · say fix <issue> or code <change>');
    }
    CliRibbon?.setNotice?.('Bridge armed · in-app coding', 'ready');
    return { ok: true, armed: true };
  },

  disarm() {
    this.armed = false;
    window._architectBridgeArmed = false;
    this.stopWatch();
    this._watchIds.clear();
  },

  stopWatch() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  },

  startWatch() {
    if (!this.isActive()) return;
    this.stopWatch();
    let ticks = 0;
    this._pollTimer = setInterval(async () => {
      if (!this.isActive() || document.hidden) return;
      ticks++;
      if (this.lastTaskId) await this.poll(this.lastTaskId, true);
      // Also poll any watched open ids for multi-task street sessions
      if (ticks % 2 === 0 && this._watchIds.size) {
        for (const id of [...this._watchIds]) {
          if (id !== this.lastTaskId) await this.poll(id, true);
        }
      }
      if (ticks % 4 === 0) await this.refreshOpen();
    }, 4000);
  },

  async refreshOpen() {
    const r = await this.api({ mode: 'architect_poll', limit: 8 }).catch(() => ({}));
    const rows = r.summons || [];
    const open = rows.filter(s => s.status === 'open' || s.status === 'in_progress');
    if (open.length && !this.lastTaskId) this.lastTaskId = open[0].id;
    open.forEach(s => this._watchIds.add(s.id));
    // Deliver any newly answered while watching
    for (const s of rows) {
      if (s.status === 'answered' && s.answer && !this._delivered.has(s.id)) {
        this._deliverAnswer(s.id, s.answer, s.question);
      }
    }
    return r;
  },

  /**
   * Queue a street task for desktop Grok Build.
   * Primary in-app coding path for the architect.
   */
  async push(task, opts = {}) {
    if (!Auth?.user) {
      ACIControl?.reply('Sign in with G as architect first');
      Auth?.openLoginModal?.('Sign in to arm Architect Bridge');
      return { error: 'login required' };
    }
    if (!this.isActive()) {
      const msg = 'Bridge is architect-only — notisastranov@gmail.com';
      AciCli?.print(msg, 'err');
      return { error: 'architect_only', text: msg };
    }
    if (!(await AciCoders?.ensureSession?.())) return { error: 'session expired' };

    const text = String(task || '').trim();
    if (text.length < 3) return { error: 'task too short' };

    const kind = opts.kind
      || (/^code\b|^edit\b/i.test(text) ? 'code'
        : /^dev\b/i.test(text) ? 'dev'
        : /^bridge\b/i.test(text) ? 'bridge'
        : 'fix');
    const field = { ...this.fieldContext(), ...(opts.field || {}) };

    GlobeDeck?.setThinking?.(true, 'Bridge → Grok Build…');
    const r = await this.api({
      mode: 'architect_push',
      task: text,
      kind,
      ...field,
      context: field,
    });
    GlobeDeck?.setThinking?.(false);

    if (r.error) {
      AciCli?.print('Bridge error: ' + r.error, 'err');
      ACIControl?.reply('Bridge error: ' + r.error);
      return r;
    }

    this.armed = true;
    this.lastTaskId = r.summon_id;
    if (r.summon_id) this._watchIds.add(r.summon_id);

    const msg = 'Bridge #' + r.summon_id + ' queued — Grok Build coding on desktop · stays in this chat when done';
    AciCli?.print(msg, 'ok');
    ACIControl?.reply(msg);
    GlobeDeck?.expand?.('Bridge #' + r.summon_id);
    GlobeDeck?.setPreview?.(text.slice(0, 120));
    CliRibbon?.setNotice?.('Bridge #' + r.summon_id + ' → Grok Build', 'ready');
    this.startWatch();
    return { ...r, text: msg, bridge: true, summon_id: r.summon_id };
  },

  /**
   * Queue a natural-language build task from chat (architect only).
   * Returns null if not applicable so chat can continue.
   */
  async queueBuildFromChat(message, opts = {}) {
    if (!this.isActive()) return null;
    const m = String(message || '').trim();
    if (m.length < 6) return null;
    if (this.wantsBridgeCmd(m)) return this.handleCommand(m);
    if (!AciCoders?.isBuildTask?.(m) && !opts.force) return null;
    // Skip pure questions that are not implementation asks
    if (/^(why|what is|how does|explain|do we have)\b/i.test(m) && !opts.force) return null;
    return this.push(m, { kind: opts.kind || 'fix' });
  },

  async poll(summonId, quiet) {
    const id = summonId || this.lastTaskId;
    if (!id) {
      if (!quiet) AciCli?.print('usage: bridge poll <id>', 'err');
      return { error: 'no id' };
    }
    const r = await this.api({ mode: 'architect_poll', summon_id: id });
    if (!quiet) {
      if (r.pending) AciCli?.print('#' + id + ' pending — Grok Build working…', 'dim');
      else if (r.text) AciCli?.print('Bridge #' + id + ': ' + r.text.slice(0, 900), 'out');
    }
    if (r.text && !r.pending) {
      this._deliverAnswer(id, r.text, r.question);
    }
    return r;
  },

  _deliverAnswer(id, text, question) {
    if (this._delivered.has(id)) return;
    this._delivered.add(id);
    // Keep set bounded
    if (this._delivered.size > 80) {
      const first = this._delivered.values().next().value;
      this._delivered.delete(first);
    }
    const shown = 'Bridge #' + id + ' done: ' + String(text).slice(0, 280);
    AciCli?.print(shown, 'reply');
    ACIControl?.reply(shown);
    GlobeDeck?.expand?.('Bridge fix #' + id);
    GlobeDeck?.setPreview?.(String(text).slice(0, 140));
    CliRibbon?.setNotice?.('Bridge #' + id + ' fixed', 'ready');
    if (AciCoders?._recordReply) AciCoders._recordReply(id, text);
    if (AciCoders?.history) {
      AciCoders.history.push({ role: 'assistant', text: shown, via: 'architect_bridge', summon_id: id });
      if (AciCoders.history.length > 40) AciCoders.history = AciCoders.history.slice(-40);
    }
    if (Voice?.maySpeak?.() && Voice?.shouldSpeak?.(text)) {
      speak('Bridge fix ready. ' + String(text).slice(0, 100), () => {}, false);
    }
    this._watchIds.delete(id);
    if (this.lastTaskId === id) this.lastTaskId = null;
  },

  async status() {
    if (!this.isActive()) return { error: 'architect_only' };
    const r = await this.api({ mode: 'architect_poll', limit: 6 });
    const open = (r.summons || []).filter(s => s.status === 'open' || s.status === 'in_progress');
    const msg = this.armed
      ? 'Bridge armed · ' + open.length + ' open · last #' + (this.lastTaskId || '—')
      : 'Bridge idle — say bridge to arm';
    AciCli?.print(msg, 'ok');
    ACIControl?.reply(msg);
    return { ok: true, armed: this.armed, open: open.length, last: this.lastTaskId, text: msg };
  },

  async list() {
    if (!this.isActive()) return { error: 'architect_only' };
    const r = await this.api({ mode: 'architect_poll', limit: 12 });
    const rows = r.summons || [];
    if (!rows.length) {
      AciCli?.print('no bridge tasks yet — say fix <issue> or code <change>', 'dim');
      return r;
    }
    AciCli?.print('── architect bridge · Grok Build ──', 'dim');
    rows.forEach(s => {
      AciCli?.print('#' + s.id + ' [' + s.status + '] ' + String(s.question || '').slice(0, 100),
        s.status === 'answered' ? 'ok' : 'dim');
    });
    return r;
  },

  wantsBridgeCmd(raw) {
    return /^(bridge|dev|fix|code|edit)\b/i.test(String(raw || '').trim());
  },

  async handleCommand(raw) {
    const line = String(raw || '').trim();
    const parts = line.split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();
    const rest = parts.slice(1).join(' ').trim();

    if (cmd === 'bridge') {
      const sub = (parts[1] || '').toLowerCase();
      if (!sub || sub === 'arm' || sub === 'on') return this.arm();
      if (sub === 'off' || sub === 'disarm') { this.disarm(); AciCli?.print('Bridge disarmed', 'dim'); return { ok: true }; }
      if (sub === 'status' || sub === 'stat') return this.status();
      if (sub === 'list') return this.list();
      if (sub === 'poll') {
        const id = parts[2] ? parseInt(parts[2], 10) : this.lastTaskId;
        return this.poll(id, false);
      }
      if (rest) return this.push(rest, { kind: 'bridge' });
      return this.status();
    }

    if (cmd === 'dev' || cmd === 'fix' || cmd === 'code' || cmd === 'edit') {
      if (!rest) {
        AciCli?.print('usage: ' + cmd + ' <what to change>', 'err');
        return { error: 'usage' };
      }
      const kind = (cmd === 'code' || cmd === 'edit') ? 'code' : cmd;
      return this.push(cmd + ' ' + rest, { kind });
    }

    return null;
  },
};

window.ArchitectBridge = ArchitectBridge;
