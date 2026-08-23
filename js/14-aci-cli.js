// === ACI CLI — Collective dev terminal (login required) ===
const AciCli = {
  open: false,
  history: [],
  histIdx: -1,
  buffer: '',

  primeCodersCli() {
    AciCoders?.autoStart?.();
    CliRibbon?.setActive?.('Grok');
    const input = document.getElementById('aci-cli-in');
    if (input) input.placeholder = 'Talk to Grok — type or tap 🎧 · Enter to send';
  },

  init() {
    const input = document.getElementById('aci-cli-in');
    const toggle = document.getElementById('aci-cli-toggle');
    const form = document.getElementById('aci-cli-form');
    SuperCli?.bindInputBar?.();
    if (toggle) toggle.onclick = () => this.toggle();
    if (form && !form._cliBound) {
      form._cliBound = true;
      form.addEventListener('submit', e => { e.preventDefault(); this.submitFromInput({ emptyFocus: true }); });
    }
    if (input) {
      input.onkeydown = (e) => this.onKey?.(e) || this._legacyKey(e);
      input.oninput = () => { this.buffer = input.value; window.resizeCliInput?.(input); };
      input.onfocus = () => { this.open = true; AciCoders?.enterSession?.({ focus: false, ping: false, expand: false }); };
    }
    this.onAuthChange();
  },

  onAuthChange() {
    const logged = !!(Auth && Auth.user);
    if (!logged) {
      this._welcomed = false;
      this._sessionOpened = false;
      this.open = false;
      GlobeDeck?.collapse?.();
      this.primeCodersCli();
      ArchitectBridge?.disarm?.();
      return;
    }
    const prompt = document.getElementById('aci-cli-prompt');
    if (prompt) {
      prompt.textContent = Auth?.isArchitect
        ? 'ASTRANOV@collective $'
        : ((Auth.user.user_metadata?.full_name || Auth.user.email?.split('@')[0] || 'dev') + '@collective $');
    }
    if (Auth?.isArchitect) ArchitectBridge?.arm?.({ quiet: true });
    if (window.AciCoders) AciCoders.autoStart();
    SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
  },

  show() {
    if (!Auth?.user) return;
    this.open = true;
    AciCoders?.autoStart?.();
    GlobeDeck?.expand?.('Grok');
    document.getElementById('aci-cli-in')?.focus();
  },

  async api(body, opts = {}) {
    const headers = { 'Content-Type': 'application/json', apikey: SB_KEY };
    if (Auth?.ensureSession) {
      const session = await Auth.ensureSession();
      headers.Authorization = session?.access_token ? 'Bearer ' + session.access_token : 'Bearer ' + SB_KEY;
    } else if (Auth?.client) {
      const { data } = await Auth.client.auth.getSession();
      headers.Authorization = data?.session?.access_token ? 'Bearer ' + data.session.access_token : 'Bearer ' + SB_KEY;
    } else {
      headers.Authorization = 'Bearer ' + SB_KEY;
    }
    const timeoutMs = opts.timeoutMs || (body.fast ? 28000 : 55000);
    const lane = ArcangeloDialect?.apiContext?.() || {};
    const j = await fetchJson(SB_URL + '/functions/v1/aci', {
      method: 'POST', headers,
      body: JSON.stringify({ ...body, ...lane, cli_user: Auth?.user?.id, cli_email: Auth?.user?.email }),
    }, timeoutMs);
    if (j._httpStatus === 401) j.error = j.error || 'login required — tap G to sign in';
    return j;
  },

  submitFromInput(opts = {}) {
    const input = document.getElementById('aci-cli-in');
    const line = String(input?.value || '').replace(/\n+$/, '').trim();
    if (!line) {
      if (opts.emptyFocus) AciCoders?.enterSession?.({ focus: true, ping: false });
      return false;
    }
    GlobeDeck?.onUserMessage?.('Grok — ' + line.slice(0, 40));
    GlobeDeck?.setThinking?.(true, 'Grok…');
    input.value = '';
    this.buffer = '';
    window.resizeCliInput?.(input);
    void this.run(line);
    return true;
  },

  async run(line, opts = {}) {
    line = (window.fixVoiceHotwords || (x => x))(String(line || '').trim());
    if (!line) { await AciCoders?.enterSession?.({ focus: true, ping: false }); return; }
    await AciCoders?.enterSession?.({ focus: false, ping: false, expand: false });
    this.history.push(line);
    this.histIdx = -1;
    this.print((document.getElementById('aci-cli-prompt')?.textContent || '›') + ' ' + line, 'cmd');
    const routed = await SuperCli?.exec?.(line, opts);
    if (routed?.handled) return;
    await this.handle(line);
  },

  onKey(e) {
    const enter = e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !e.isComposing;
    if (enter) { e.preventDefault(); this.submitFromInput(); return true; }
    if (e.key === 'Escape') { this.toggle(); return true; }
    return false;
  },

  _legacyKey(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const sug = this.suggest(e.target.value);
      if (sug) { e.target.value = sug; this.buffer = sug; window.resizeCliInput?.(e.target); }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.clear();
    }
  },

  toggle() {
    if (!Auth?.user) { GlobeDeck?.expand?.('Guest'); this.open = true; return; }
    GlobeDeck?.toggle?.();
    this.open = !!GlobeDeck?.expanded;
  },

  clear() {
    const input = document.getElementById('aci-cli-in');
    if (input) { input.value = ''; this.buffer = ''; window.resizeCliInput?.(input); }
    GlobeDeck?.clearLog?.();
  },

  print(t, cls) { GlobeDeck?.log?.(t, cls); },

  async handle(line) {
    const parts = line.trim().split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();
    const rest = parts.slice(1).join(' ');
    const voiceSessionActive = !!(window.Voice && Voice.session);

    if (!cmd) return;
    if (cmd === 'help' || cmd === '?') {
      this.print('locate · order · resources · channels · starship · starlink · spacex · crawl', 'dim');
      this.print('task job barman 3h · task housekeeper 1w · task date coffee 2h · task errand · task claim', 'dim');
      this.print('channels status · seed · publish · order · enable mesh', 'dim');
      this.print('think · coders · theme · Architect: fix|bridge', 'dim');
      return;
    }
    if (cmd === 'resources' || cmd === 'resource' || cmd === 'donate' || cmd === 'monitor') {
      ResourceMonitor?.init?.();
      const msg = ResourceMonitor?.handleCli?.(line);
      this.print(msg || 'resources', 'ok');
      return;
    }
    if (cmd === 'channels' || cmd === 'channel' || cmd === 'cm' || cmd === 'spacenetcm') {
      SpaceNetCM?.init?.();
      const msg = SpaceNetCM?.handleCli?.(line);
      this.print(msg || 'channels', 'ok');
      return;
    }
    if (cmd === 'starship' || cmd === 'f13') {
      try { StarshipFlight13?.init?.(); } catch (_) {}
      try { GlobeInfoTiles?.init?.({ seed: false }); } catch (_) {}
      const msg = await StarshipFlight13?.handleCli?.(rest || line);
      this.print(msg || 'f13', 'ok');
      return;
    }
    if (cmd === 'spacex' || (cmd === 'video' && /tile|spacex|globe/.test(rest))) {
      try { GlobeInfoTiles?.init?.({ seed: false }); } catch (_) {}
      const msg = await GlobeInfoTiles?.handleCli?.(rest || 'spacex');
      this.print(msg || 'spacex tiles', 'ok');
      return;
    }
    if (cmd === 'starlink') {
      try { StarlinkConstellation?.init?.(); StarlinkConstellation?.ensureBuilt?.(); } catch (_) {}
      const msg = await StarlinkConstellation?.handleCli?.(rest || 'starlink');
      this.print(msg || 'starlink', 'ok');
      return;
    }
    if (cmd === 'crawl' || cmd === 'spacenet') {
      const msg = await SpaceNetBrain?.handleCli?.(rest || 'crawl all');
      this.print(msg || 'crawl', 'ok');
      return;
    }
    if (cmd === 'task' || cmd === 'tasks' || cmd === 'job' || cmd === 'jobs'
      || cmd === 'errand' || cmd === 'date' || cmd === 'dating' || cmd === 'hire') {
      CityTasks?.init?.();
      const msg = await CityTasks?.handleCli?.(
        (cmd === 'task' || cmd === 'tasks') ? line : ('task ' + line)
      );
      this.print(msg || 'task', 'ok');
      return;
    }
    if (cmd === 'clear') { this.clear(); return; }
    if (cmd === 'exit' || cmd === 'close') { GlobeDeck?.completeTask('cli'); return; }
    if (cmd === 'logout') { await Auth.signOut(); this.print('signed out', 'ok'); return; }

    if (cmd === 'theme' || cmd === 'dark' || cmd === 'bright' || cmd === 'light' || cmd === 'auto') {
      let mode = cmd === 'theme' ? (parts[1] || '').toLowerCase() : (cmd === 'light' ? 'bright' : cmd);
      if (mode === 'auto' || mode === 'system') mode = 'auto';
      AstranovTheme?.set?.(mode);
      this.print('theme → ' + (AstranovTheme?._auto ? 'auto' : AstranovTheme?.mode || 'dark'), 'ok');
      return;
    }
    if (cmd === 'code' || cmd === 'edit') {
      if (!rest) { this.print('usage: code <desc>', 'err'); return; }
      GlobeDeck.activeTask = 'coders';
      // Architect: code/edit go straight to Grok Build bridge (in-app coding path)
      if (Auth?.isArchitect || AciCoders?.isArchitect?.()) {
        const br = await ArchitectBridge?.handleCommand?.(cmd + ' ' + rest);
        if (br && !br.error) {
          GlobeDeck?.finishCliIfOneShot(cmd);
          return;
        }
      }
      AciCoders?.handleMessage?.('edit code: ' + rest);
      this.print('code change sent to coders', 'ok');
      GlobeDeck?.finishCliIfOneShot(cmd);
      return;
    }
    if (cmd === 'db' || cmd === 'database') {
      if (!rest) { this.print('usage: db <cmd>', 'err'); return; }
      try {
        const r = await ACI.api({ mode: 'db', detail: rest });
        this.print('db: ' + (r.text || 'ok'), 'ok');
      } catch (e) {
        this.print('db err, try coders', 'err');
        AciCoders?.handleMessage?.('db change: ' + rest);
      }
      GlobeDeck?.finishCliIfOneShot(cmd);
      return;
    }
    if (cmd === 'think') {
      if (!rest) { ACIControl?.reply('usage: think <prompt>'); return; }
      const r = await ACI.think(rest);
      ACIControl?.reply(r || '(empty)');
      if (voiceSessionActive && Voice.shouldSpeak(r)) speak(r.slice(0, 200));
      GlobeDeck?.finishCliIfOneShot(cmd);
      return;
    }
    // ... other commands unchanged
    if (cmd === 'evolve' || cmd === 'e') {
      const r = await ACI.evolve(rest);
      ACIControl?.reply(r || '(evolved)');
      GlobeDeck?.finishCliIfOneShot(cmd);
      return;
    }
    if (cmd === 'teach') {
      if (!rest) { this.print('usage: teach <content>', 'err'); return; }
      const r = await ACI.teach(rest);
      this.print(r?.ok ? 'taught' : (r?.error || 'fail'), r?.ok ? 'ok' : 'err');
      GlobeDeck?.finishCliIfOneShot(cmd);
      return;
    }
    if (cmd === 'stats' || cmd === 's') {
      const r = await ACI.api({ mode: 'stats' });
      this.print(r?.text || JSON.stringify(r).slice(0,300), 'out');
      GlobeDeck?.finishCliIfOneShot(cmd);
      return;
    }
    if (cmd === 'seed') {
      const r = await ACI.api({ mode: 'seed' });
      this.print(r?.text || 'seeded', 'ok');
      GlobeDeck?.finishCliIfOneShot(cmd);
      return;
    }
    if (cmd === 'council' || cmd === 'c') {
      const r = await ACI.api({ mode: 'council' });
      this.print(r?.verdict || r?.text || 'council', 'out');
      GlobeDeck?.finishCliIfOneShot(cmd);
      return;
    }
    if (cmd === 'bridge' || cmd === 'dev' || cmd === 'fix' || cmd === 'code' || cmd === 'edit') {
      if (cmd !== 'bridge' && !rest) { this.print('usage: ' + cmd + ' <task>', 'err'); return; }
      GlobeDeck.activeTask = 'coders';
      await ArchitectBridge?.handleCommand?.(line);
      return;
    }
    if (cmd === 'coders' || cmd === 'composer' || cmd === 'cursor' ||
        (cmd === 'summon' && /^coders?$/i.test(parts[1] || ''))) {
      const task = cmd === 'summon' ? rest : (cmd === 'coders' ? rest : rest || '');
      if (!task) { this.print('usage: coders <task desc>', 'err'); return; }
      if (!Auth?.user) {
        this.print('sign in with G first', 'err');
        Auth?.openLoginModal?.('Sign in to use coders');
        return;
      }
      GlobeDeck.activeTask = 'coders';
      AciCoders?.handleMessage?.(task);
      this.print('coders task sent', 'ok');
      return;
    }
    if (cmd === 'vendor' || cmd === 'v') {
      await Commerce?.showPicker?.();
      GlobeDeck?.finishCliIfOneShot(cmd);
      return;
    }
    if (cmd === 'order' || cmd === 'o') {
      if (!rest) { this.print('usage: order <item>', 'err'); return; }
      const r = await Commerce?.placeOrder?.(rest);
      this.print(r?.ok ? 'ordered' : (r?.error || 'fail'), r?.ok ? 'ok' : 'err');
      GlobeDeck?.finishCliIfOneShot(cmd);
      return;
    }
    if (cmd === 'batch' || cmd === 'node') {
      AstranovNode?.showPanel?.();
      GlobeDeck?.finishCliIfOneShot(cmd);
      return;
    }
    if (cmd === 'radio' || cmd === 'vhf') {
      Comms?.startVHF?.();
      GlobeDeck?.finishCliIfOneShot(cmd);
      return;
    }

    // Radar place search: after single-click map, CLI text is a local search
    if (window.MapRadar?.last && line && !/^(think|code|fix|dev|bridge)\b/i.test(line)) {
      const q = (cmd === 'radar' || cmd === 'search' || cmd === 'find') ? rest : line;
      if (q && q.length >= 2) {
        MapRadar.runQuery(q);
        this.print('radar · ' + q, 'ok');
        return;
      }
    }
    if (cmd === 'radar' || cmd === 'search' || cmd === 'find') {
      const pos = window.MapRadar?.last || window._lastPos;
      if (!pos?.lat) {
        this.print('tap the map once to set radar, then type e.g. pharmacy', 'err');
        return;
      }
      MapRadar.at(pos.lat, pos.lng, { query: rest || '' });
      if (rest) MapRadar.runQuery(rest);
      this.print(rest ? ('radar · ' + rest) : 'radar · type what you need', 'ok');
      return;
    }

    // Freeform → Core Brain (globe agent). Never leave users at "unknown".
    GlobeDeck.activeTask = 'coders';
    if (window.AstranovCoreBrain?.handle) {
      await AstranovCoreBrain.handle(line);
      return;
    }
    if (window.AciCoders?.handleMessage) {
      await AciCoders.handleMessage(line);
      return;
    }
    ACIControl?.reply('Brain loading — tap 🎧 again in a moment');
  },

  suggest(prefix) {
    const p = (prefix || '').toLowerCase();
    const cmds = ['think', 'evolve', 'teach', 'stats', 'seed', 'council', 'coders', 'bridge', 'dev', 'fix', 'code', 'db', 'theme', 'auto', 'dark', 'bright', 'vendor', 'order', 'batch', 'radio', 'clear', 'exit', 'logout'];
    for (const c of cmds) if (c.startsWith(p)) return c;
    return '';
  }
};
window.AciCli = AciCli;
