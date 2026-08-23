// === SUPER CLI BRAIN — full command of collective intelligence + UI ===
Object.assign(SuperCli, {
  devMode: false,
  _devKey: 'astranov-dev-mode',

  PANELS: {
    vendor: 'vendor-menu', vendors: 'vendor-menu', order: 'vendor-menu', shop: 'vendor-menu',
    batch: 'node-batch', node: 'node-batch',
    radio: 'sat-radio', vhf: 'sat-radio', pmr: 'sat-radio',
    video: 'globe-youtube', youtube: 'globe-youtube', yt: 'globe-youtube',
  },

  CITIES: {
    athens: [37.98, 23.73], athina: [37.98, 23.73], rhodes: [36.44, 28.22], rodos: [36.44, 28.22],
    london: [51.51, -0.13], paris: [48.86, 2.35], berlin: [52.52, 13.41], rome: [41.90, 12.50],
    newyork: [40.71, -74.01], tokyo: [35.68, 139.69], sydney: [-33.87, 151.21],
  },

  ZOOM: { earth: 2.2, orbit: 4.4, leo: 4.4, solar: 8, system: 8, galaxy: 16 },

  initBrain() {
    try {
      this.devMode = sessionStorage.getItem(this._devKey) === '1';
      if (this.devMode) this._applyDevHud();
    } catch (_) {}
  },

  _applyDevHud() {
    if (!this.devMode) return;
    GlobeDeck?.setTitle(ACL_TITLE + ' · DEV');
    GlobeDeck?.setPreview('DEV — brain + UI under command line');
  },

  _setDevMode(on) {
    this.devMode = !!on;
    try { sessionStorage.setItem(this._devKey, on ? '1' : '0'); } catch (_) {}
    if (on) {
      this._applyDevHud();
      AciCoders?.autoStart?.();
      GlobeDeck.activeTask = 'coders';
    } else {
      GlobeDeck?.setTitle(ACL_TITLE);
    }
    this.setContext(this.inferContext());
  },

  parseParts(line) {
    return (line.match(/(?:[^\s"]+|"[^"]*")+/g) || []).map(p => p.replace(/^"|"$/g, ''));
  },

  isStructuredCmd(cmd) {
    const c = (cmd || '').toLowerCase();
    const known = new Set([
      'help', '?', 'dev', 'ui', 'brain', 'coders', 'composer', 'cursor', 'grok', 'summon',
      'connect', 'open', 'deploy', 'clear', 'exit', 'close', 'logout', 'think', 'evolve',
      'teach', 'stats', 'owner', 'seed', 'distill', 'council', 'mode', 'batch', 'vendors',
      'shops', 'order', 'vendor', 'ping', 'locate', 'gps', 'me', 'vhf', 'call', 'phone',
      'drive', 'news', 'roles', 'claim', 'field_stats', 'hold', 'resume', 'stop',
      'sync', 'requests', 'wishlist', 'players', 'friends', 'kryfto', 'hide', 'seek', 'collab',
      'hideandseek', 'housekeeping', 'συγυρισμα', 'συγύρισμα', 'pyramid', 'pyramids', 'willa', 'willagame',
      'team', 'contact', 'msg',
      'telemachos', 'tilemaxos', 'telemachus', 'tilemachos', 'teledromos', 'teledromus',
      'pilot', 'drone', 'drones', 'fleet',
      'youtube', 'yt', 'watch', 'play', 'space', 'scenario', 'add', 'post', 'superadd',
      'theme', 'dark', 'bright', 'light',
      'yacht', 'yachts', 'charter', 'booker',
    ]);
    return known.has(c);
  },

  out(text, cls) { AciCli?.print(text, cls || 'out'); },

  zoomTo(level) {
    const map = {
      earth: 'global', global: 'global', national: 'national', country: 'national',
      city: 'city', neighborhood: 'neighborhood', solar: 'solar', system: 'solar',
    };
    const id = map[(level || 'global').toLowerCase()] || (level || 'global').toLowerCase();
    if (ZoomTiers?.goTo?.(id)) {
      this.out('zoom → ' + ZoomTiers.current().label, 'ok');
      return;
    }
    const z = this.ZOOM[(level || 'earth').toLowerCase()] || this.ZOOM.earth;
    window._globeFly = {
      mode: 'zoom',
      fromZ: camera.position.z,
      toZ: z,
      t0: performance.now(),
      dur: GlobeControl?.flyDuration?.(camera.position.z, z) || 1400,
    };
    CosmicZoom.update(z);
    this.out('zoom → ' + (level || 'earth') + ' (z=' + z + ')', 'ok');
  },

  async flyTo(lat, lng, label, opts) {
    if (!TrackballGuard?.beforeFly?.(lat, lng, opts)) return;
    const z = opts?.city ? (GlobeControl?.Z?.city || 1.38) : (GlobeControl?.Z?.global || 2.55);
    GlobeControl?.flyToLatLng?.(lat, lng, label || 'fly', z, { city: !!opts?.city, force: !!opts?.force });
    MapDepict?.pulse?.(lat, lng, 0x00ddff, label || 'fly', 8000);
    GlobeControl?.noteAutoFly?.();
    this.out('fly → ' + (label || lat.toFixed(2) + ', ' + lng.toFixed(2)), 'ok');
  },

  statusSnapshot() {
    return {
      devMode: this.devMode,
      context: this._context,
      deck: { expanded: GlobeDeck?.expanded, task: GlobeDeck?.activeTask, thinking: GlobeDeck?.thinking },
      brain: {
        neurons: ACI?.neurons?.length || 0,
        thinkMode: ACI?.thinkMode || 'default',
        codersListening: !!AciCoders?._listening,
        codersEngine: AciCoders?.engine,
        cause: AciCoders?.CAUSE,
      },
      batch: { session: AstranovSession?.SESSION_NAME, id: AstranovSession?.BATCH_SHORT_ID, devices: AstranovNode?.peerCount },
      superspace: SuperSpace?.status?.(),
      globe: { level: CosmicZoom?.level, follow: GlobeControl?.followMode, exploring: GlobeControl?.userExploring },
      user: AstranovSession?.isAstranov?.() ? 'ASTRANOV' : (Auth?.user ? (Auth.user.email?.split('@')[0] || 'user') : 'guest'),
      session: AstranovSession?.SESSION_NAME || 'ASTRANOV COLLECTIVE INTELLIGENCE',
      owner: !!Auth?.isOwner,
    };
  },

  printHelp() {
    const owner = Auth?.isOwner;
    this.out('── Astranov — brain + UI + dev ──', 'dim');
    this.out('dev on|off · dev task <msg> · dev peers · dev deploy · dev status', 'ok');
    this.out('ui show batch|radio|vendor|youtube · ui hide · ui fly athens · ui zoom galaxy', 'ok');
    this.out('youtube <search> · watch <url> · play 2 (pick result)', 'ok');
    this.out('space locate <topic> · space status — brain places media on globe/cosmos', 'ok');
    this.out('scenario wake|city|groceries|youtube|reviews|list — real user flows', 'ok');
    this.out('players · kryfto · ΣΥΓΥΡΙΣΜΑ · pyramid · willa — 12 Olympians 🔵 · 12 Cronians 🔴', 'ok');
    this.out('team create <name> · team join <id> · contact video|voice|message <name>', 'ok');
    this.out('cli search <text> · cli users · cli view <name> · cloud dm <name> · chat <name> <msg>', 'ok');
    this.out('drivers · driver <name> — pick delivery driver on map/cloud', 'ok');
    this.out('tilemaxos — takeover ANY drone (FPV priority) · flyback to pilot · scan · evolve', 'ok');
    this.out('profile me · match <site> dates [pax] · match field <site> <name> · site approve <slug>', 'ok');
    this.out('theme dark|bright · or just: dark · bright — globe + city map + UI', 'ok');
    this.out('add · post — Super Add camera · global/team/local channel', 'ok');
    this.out('Tri-UI: SuperCli + SuperVoice + SuperSpace · mic+send at bottom bar', 'dim');
    this.out('brain think|evolve|teach|coders|listen on|off|status · brain order <task>', owner ? 'ok' : 'dim');
    this.out('locate · order · batch · vhf · coders · deploy · think · type anything', 'ok');
    if (owner) this.out('Owner: brain order <task> = execute · coders <task> = explicit order', 'dim');
    ACIControl?.reply('Full command: dev on · ui status · brain status · then build');
    GlobeDeck?.finishCliIfOneShot('help');
  },

  async cmdDev(parts) {
    const sub = (parts[1] || 'status').toLowerCase();
    const rest = parts.slice(2).join(' ');

    if (sub === 'on' || sub === 'start') {
      this._setDevMode(true);
      GlobeDeck?.expand(ACL_TITLE + ' · DEV');
      await AciCoders?.autoStart?.();
      this.out('DEV on — brain + UI under your command · peers see tasks', 'ok');
      ACIControl?.reply('Dev mode on — type tasks, ui commands, or brain orders');
      return { ok: true };
    }
    if (sub === 'off' || sub === 'stop') {
      this._setDevMode(false);
      this.out('DEV off', 'ok');
      return { ok: true };
    }
    if (sub === 'task' || sub === 'broadcast') {
      if (!rest) { this.out('usage: dev task <message>', 'err'); return { error: 'empty' }; }
      if (AstranovNode?.batchId) AstranovNode.broadcastTask(rest);
      else this.out('no batch — run batch first', 'dim');
      GlobeDeck.activeTask = 'coders';
      await AciCoders?.handleMessage(rest);
      return { ok: true };
    }
    if (sub === 'peers') {
      this.out((AstranovSession?.SESSION_NAME || 'collective') + ' · ' + (AstranovNode?.peerCount ?? 0) + ' device(s)', 'ok');
      GlobeDeck?.finishCliIfOneShot('dev');
      return { ok: true };
    }
    if (sub === 'deploy') {
      await AciConnect?.deploy(rest || 'continue deployment');
      GlobeDeck?.finishCliIfOneShot('deploy');
      return { ok: true };
    }
    if (sub === 'connect') {
      await AciConnect?.connect(true);
      GlobeDeck?.finishCliIfOneShot('connect');
      return { ok: true };
    }
    if (sub === 'status') {
      this.out(JSON.stringify(this.statusSnapshot(), null, 0).slice(0, 700), 'out');
      GlobeDeck?.finishCliIfOneShot('dev');
      return { ok: true };
    }
    this.out('usage: dev on|off|task|peers|deploy|connect|status', 'err');
    return { error: 'unknown dev subcommand' };
  },

  async cmdUi(parts) {
    const sub = (parts[1] || 'status').toLowerCase();
    const rest = parts.slice(2).join(' ');

    if (sub === 'show' || sub === 'open') {
      const key = (parts[2] || '').toLowerCase();
      const panel = this.PANELS[key];
      if (panel) {
        GlobeDeck?.showStage(panel, key === 'batch' || key === 'node' ? 'batch' : key === 'radio' || key === 'vhf' ? 'radio' : 'commerce');
        if (key === 'vendor' || key === 'order') await Commerce?.showPicker?.();
        if (key === 'batch' || key === 'node') AstranovNode?.showPanel?.();
        if (key === 'radio' || key === 'vhf') Comms?.startVHF?.();
        if (key === 'video' || key === 'youtube' || key === 'yt') GlobeVideo?.showPanel?.('YouTube on globe');
        this.setContext(this.inferContext());
        this.out('ui show → ' + key, 'ok');
        return { ok: true };
      }
      if (key === 'deck' || key === 'cli') {
        GlobeDeck?.expand(ACL_TITLE);
        document.getElementById('aci-cli-in')?.focus();
        return { ok: true };
      }
      this.out('usage: ui show vendor|batch|radio|deck', 'err');
      return { error: 'unknown panel' };
    }
    if (sub === 'hide' || sub === 'close') {
      GlobeDeck?.hideStage();
      this.out('ui hidden', 'ok');
      this.setContext(this.inferContext());
      return { ok: true };
    }
    if (sub === 'expand') { GlobeDeck?.expand(ACL_TITLE); return { ok: true }; }
    if (sub === 'collapse') { GlobeDeck?.collapse(); return { ok: true }; }
    if (sub === 'toggle') { GlobeDeck?.toggle(); return { ok: true }; }
    if (sub === 'zoom') {
      this.zoomTo(parts[2] || 'earth');
      GlobeDeck?.finishCliIfOneShot('ui');
      return { ok: true };
    }
    if (sub === 'fly' || sub === 'go') {
      const a = parts[2], b = parts[3];
      if (a && b && !isNaN(parseFloat(a))) {
        await this.flyTo(parseFloat(a), parseFloat(b), rest || 'target');
        return { ok: true };
      }
      const city = (a || '').toLowerCase().replace(/\s/g, '');
      const c = this.CITIES[city];
      if (c) { await this.flyTo(c[0], c[1], city); return { ok: true }; }
      this.out('usage: ui fly athens | ui fly 36.4 28.2', 'err');
      return { error: 'bad fly' };
    }
    if (sub === 'title') {
      GlobeDeck?.setTitle(rest || ACL_TITLE);
      this.out('title set', 'ok');
      return { ok: true };
    }
    if (sub === 'stop') {
      userIntervene?.();
      return { ok: true };
    }
    if (sub === 'status') {
      this.out(JSON.stringify(this.statusSnapshot().deck, null, 0) + ' · ' + CosmicZoom?.level, 'out');
      GlobeDeck?.finishCliIfOneShot('ui');
      return { ok: true };
    }
    this.out('usage: ui show|hide|fly|zoom|expand|collapse|status', 'err');
    return { error: 'unknown ui subcommand' };
  },

  async cmdBrain(parts) {
    const sub = (parts[1] || 'status').toLowerCase();
    const rest = parts.slice(2).join(' ');

    if (sub === 'think') {
      if (!rest) { ACIControl?.reply('usage: brain think <prompt>'); return { error: 'empty' }; }
      const r = await ACI.think(rest);
      ACIControl?.reply(r || '(empty)');
      GlobeDeck?.finishCliIfOneShot('think');
      return { ok: true, text: r };
    }
    if (sub === 'evolve') {
      this.out('evolving…', 'dim');
      const r = await ACI.evolve(rest || 'cli');
      this.out(JSON.stringify(r || { ok: true }).slice(0, 400), 'out');
      GlobeDeck?.finishCliIfOneShot('evolve');
      return { ok: true };
    }
    if (sub === 'teach') {
      if (!rest) { this.out('usage: brain teach <content>', 'err'); return { error: 'empty' }; }
      await ACI.teach(rest);
      this.out('remembered · neuron spawned', 'ok');
      GlobeDeck?.finishCliIfOneShot('teach');
      return { ok: true };
    }
    if (sub === 'stats' || sub === 'owner') {
      const r = await AciCli.api({ mode: sub === 'owner' ? 'owner_sync' : 'stats' });
      this.out(JSON.stringify(r, null, 0).slice(0, 600), 'out');
      if (r.is_owner) Auth.isOwner = true;
      GlobeDeck?.finishCliIfOneShot(sub);
      return { ok: true };
    }
    if (sub === 'seed' || sub === 'distill' || sub === 'council') {
      if (!Auth?.isOwner) { this.out('owner only', 'err'); return { error: 'owner' }; }
      const body = { mode: sub };
      if (sub === 'council') {
        body.council_mode = (parts[2] || 'list').toLowerCase();
        if (body.council_mode === 'convene') {
          body.title = parts[3] || 'CLI case';
          body.description = parts.slice(4).join(' ') || body.title;
        }
      }
      const r = await AciCli.api(body);
      this.out(JSON.stringify(r).slice(0, 600), 'out');
      GlobeDeck?.finishCliIfOneShot(sub);
      return { ok: true };
    }
    if (sub === 'mode') {
      ACI.thinkMode = rest || '';
      this.out('brain mode: ' + (ACI.thinkMode || 'default'), 'ok');
      GlobeDeck?.finishCliIfOneShot('mode');
      return { ok: true };
    }
    if (sub === 'listen') {
      const on = (parts[2] || 'on').toLowerCase();
      if (on === 'off') { AciCoders?.stopListening?.(); this.out('coders listen off', 'ok'); }
      else { AciCoders?.startListening?.(); this.out('coders listen on', 'ok'); }
      return { ok: true };
    }
    if (sub === 'coders' || sub === 'chat') {
      GlobeDeck.activeTask = 'coders';
      await AciCoders?.handleMessage(rest || 'status');
      return { ok: true };
    }
    if (sub === 'order' || sub === 'execute') {
      if (!Auth?.isOwner) { this.out('owner only — brain order <task>', 'err'); return { error: 'owner' }; }
      GlobeDeck.activeTask = 'coders';
      await AciCoders?.handleMessage('coders ' + rest);
      return { ok: true };
    }
    if (sub === 'ping') {
      const r = await ACI.think('ping');
      ACIControl?.reply(r || 'pong');
      GlobeDeck?.finishCliIfOneShot('ping');
      return { ok: true };
    }
    if (sub === 'status') {
      const s = this.statusSnapshot().brain;
      s.batch = this.statusSnapshot().batch;
      s.devMode = this.devMode;
      this.out(JSON.stringify(s, null, 0), 'out');
      GlobeDeck?.finishCliIfOneShot('brain');
      return { ok: true };
    }
    this.out('usage: brain think|evolve|teach|coders|listen|order|status', 'err');
    return { error: 'unknown brain subcommand' };
  },

  async cmdScenario(parts, rest) {
    const name = (parts[1] || 'list').toLowerCase();
    const topic = parts.slice(2).join(' ') || rest.replace(/^[^\s]+\s*/, '');
    await CityLife?.run?.(name, topic);
    return { ok: true };
  },

  async cmdSpace(parts, rest) {
    const sub = (parts[1] || 'status').toLowerCase();
    if (sub === 'status') {
      this.out(JSON.stringify(SuperSpace?.status?.(), null, 0), 'out');
      GlobeDeck?.finishCliIfOneShot('space');
      return { ok: true };
    }
    if (sub === 'locate' || sub === 'find' || sub === 'place') {
      const topic = parts.slice(2).join(' ') || rest.replace(/^locate\s*/i, '');
      if (!topic) { this.out('usage: space locate mars documentary', 'err'); return { error: 'empty' }; }
      await SuperSpace?.locateText?.(topic);
      return { ok: true };
    }
    if (sub === 'zoom') {
      SuperSpace?.zoomTo?.(parts[2] || 'earth');
      return { ok: true };
    }
    if (rest) {
      await SuperSpace?.locateText?.(rest);
      return { ok: true };
    }
    this.out('usage: space locate <topic> · space status · space zoom galaxy', 'err');
    return { error: 'unknown' };
  },

  async devBrain(line) {
    GlobeDeck.activeTask = 'coders';
    AciCoders?.observeActivity?.('dev', line.slice(0, 120));
    if (AstranovNode?.batchId) AstranovNode.broadcastTask(line);
    await AciCoders?.handleMessage(line);
    return { ok: true };
  },

  async exec(line, opts = {}) {
    const raw = String(line || '').trim();
    if (!raw) return { handled: false };
    const parts = this.parseParts(raw);
    const cmd = (parts[0] || '').toLowerCase();
    const rest = parts.slice(1).join(' ');

    try {
      if (TelemachosPilot?.wantsCmd?.(raw)) {
        await TelemachosPilot.cli(parts, raw);
        return { handled: true };
      }
      if (AstranovPresence?.wantsKryftoStart?.(raw)) {
        AstranovPresence?.startKryfto?.();
        return { handled: true };
      }
      if (WillaGames?.wantsPyramid?.(raw)) {
        WillaGames?.startPyramid?.();
        return { handled: true };
      }
      if (WillaGames?.wantsWilla?.(raw) || cmd === 'willa' || cmd === 'willagame') {
        WillaGames?.startWilla?.();
        return { handled: true };
      }
      if (cmd === 'pyramid' || cmd === 'pyramids') {
        WillaGames?.startPyramid?.();
        return { handled: true };
      }
      if (AciCoders?.isLocalGlobeCmd?.(raw)) {
        const r = AciCoders.runLocalGlobeCmd(raw);
        GlobeDeck?.finishCliIfOneShot('locate');
        return { handled: true, ...r };
      }
      if (cmd === 'locate' || cmd === 'gps' || cmd === 'me' || (cmd === 'zoom' && /^to\s+me$/i.test(rest))) {
        await SuperCli.run('locate');
        return { handled: true };
      }
      if (cmd === 'help' || cmd === '?') {
        this.printHelp();
        return { handled: true };
      }
      if (cmd === 'dev') {
        await this.cmdDev(parts);
        return { handled: true };
      }
      if (cmd === 'ui') {
        await this.cmdUi(parts);
        return { handled: true };
      }
      if (cmd === 'brain') {
        await this.cmdBrain(parts);
        return { handled: true };
      }
      if (cmd === 'space' || cmd === 'superspace') {
        await this.cmdSpace(parts, rest);
        return { handled: true };
      }
      if (cmd === 'scenario' || cmd === 'day') {
        await this.cmdScenario(parts, rest);
        return { handled: true };
      }
      if (cmd === 'theme' || cmd === 'dark' || cmd === 'bright' || cmd === 'light') {
        const mode = cmd === 'theme'
          ? (parts[1] || rest || '').toLowerCase()
          : (cmd === 'light' ? 'bright' : cmd);
        if (mode === 'dark' || mode === 'bright') {
          AstranovTheme?.set?.(mode);
          this.out('theme → ' + mode, 'ok');
        } else {
          AstranovTheme?.toggle?.();
          this.out('theme → ' + (AstranovTheme?.mode || 'dark'), 'ok');
        }
        return { handled: true };
      }
      if (cmd === 'add' || cmd === 'post' || cmd === 'superadd') {
        SuperAdd?.open?.();
        return { handled: true };
      }
      if (cmd === 'status') {
        this.out(JSON.stringify(this.statusSnapshot(), null, 0).slice(0, 800), 'out');
        GlobeDeck?.finishCliIfOneShot('status');
        return { handled: true };
      }
      if (cmd === 'sync') {
        if (AstranovSession?.isAstranov?.()) await AstranovSession?.unifyCollective?.();
        else {
          await AstranovSession?.pull?.();
          await AstranovNode?.resumeSession?.();
          await AstranovSession?.push?.(true);
        }
        AstranovWishlist?.announceRecovered?.();
        this.out('◎ ' + (AstranovSession?.SESSION_NAME || 'collective') + ' · synced across devices', 'ok');
        return { handled: true };
      }
      if (cmd === 'requests' || cmd === 'wishlist') {
        const pending = AstranovWishlist?.pending?.() || [];
        if (!pending.length) {
          this.out('No pending requests — all recovered items done or empty', 'dim');
        } else {
          pending.forEach((it, i) => {
            this.out((i + 1) + '. ' + it.text.slice(0, 140), 'ok');
          });
        }
        return { handled: true };
      }
      if (cmd === 'players' || cmd === 'friends') {
        AstranovPresence?.listPlayers?.();
        return { handled: true };
      }
      if (cmd === 'hide' || cmd === 'κρύψου') {
        AstranovPresence?.toggleHide?.();
        return { handled: true };
      }
      if (cmd === 'seek' || cmd === 'show') {
        window.hidden = false;
        if (typeof hidden !== 'undefined') hidden = false;
        if (window._meMarker) window._meMarker.visible = true;
        AstranovPresence?.broadcast?.();
        AstranovPresence?.listPlayers?.();
        return { handled: true };
      }
      if (cmd === 'collab') {
        AstranovPresence.game = 'collab';
        window.hidden = false;
        AstranovPresence?.broadcast?.();
        ACIControl?.reply('Collab mode — visible on map for all signed-in users');
        return { handled: true };
      }
      if (cmd === 'team') {
        await window.MapComms?.cmd?.(parts);
        return { handled: true };
      }
      if (cmd === 'drivers') {
        const txt = MarketplaceComms?.listDriversText?.() || 'No drivers — order first';
        ACIControl?.reply(txt);
        AciCli?.print(txt, 'ok');
        return { handled: true };
      }
      if (cmd === 'driver' && parts[1]) {
        const q = parts.slice(1).join(' ').toLowerCase();
        const pool = MarketplaceComms?.state?.drivers || [];
        const hit = pool.find(d => (d.display_name || '').toLowerCase().includes(q));
        if (hit) {
          await MarketplaceComms?.selectDriver?.(hit.id);
        } else {
          ACIControl?.reply('No driver matching «' + parts.slice(1).join(' ') + '» — try drivers');
        }
        return { handled: true };
      }
      if (cmd === 'profile') {
        await ProfileSite?.cmd?.(parts);
        return { handled: true };
      }
      if (cmd === 'booker') {
        await YachtMatcher?.bookerCli?.(parts);
        return { handled: true };
      }
      if (cmd === 'yacht' || cmd === 'yachts' || cmd === 'charter' || (cmd === 'match' && (parts[2] || '').toLowerCase() === 'yachts')) {
        await YachtMatcher?.cli?.(parts);
        return { handled: true };
      }
      if (cmd === 'auditor' || cmd === 'auditors' || cmd === 'audit') {
        await AuditorPortal?.cli?.(parts);
        return { handled: true };
      }
      if (cmd === 'brain' || cmd === 'converse' || cmd === 'talk') {
        await BrainConversation?.cli?.(parts);
        return { handled: true };
      }
      if (cmd === 'db' || cmd === 'database' || cmd === 'onedb') {
        await AstranovOneDatabase?.cli?.(parts);
        return { handled: true };
      }
      if (cmd === 'unified' || cmd === 'astranov' || cmd === 'platform') {
        await AstranovUnified?.cli?.(parts);
        return { handled: true };
      }
      if (cmd === 'coin' || cmd === 'wallet' || cmd === 'money') {
        await CoinPortal?.cli?.(parts.length > 1 && cmd === 'coin' ? parts : ['coin', ...parts.slice(1)]);
        return { handled: true };
      }
      if (cmd === 'Coins') {
        await CoinsJustice?.cli?.(parts);
        return { handled: true };
      }
      if (cmd === 'ledger' || cmd === 'justice') {
        await CoinsJustice?.cli?.(['Coins', cmd, ...parts.slice(1)]);
        return { handled: true };
      }
      if (cmd === 'hellenic' || cmd === 'hellas') {
        HellenicSource?.cli?.(parts);
        return { handled: true };
      }
      if (cmd === 'book' && /^\d{4}-\d{2}-\d{2}/.test(parts[1] || '')) {
        await YachtMatcher?.cli?.(['yacht', 'book', ...parts.slice(1)]);
        return { handled: true };
      }
      if (cmd === 'site' || cmd === 'sites' || cmd === 'book') {
        await AstranovSitesProvision?.cli?.(parts);
        return { handled: true };
      }
      if (cmd === 'cli') {
        await CliHub?.cmd?.(parts);
        return { handled: true };
      }
      if (cmd === 'cloud' && (parts[1] || '').toLowerCase() === 'dm') {
        await CliHub?.startPrivateCloud?.(parts.slice(2).join(' '));
        return { handled: true };
      }
      if (cmd === 'chat' && parts[1]) {
        const msg = parts.slice(2).join(' ');
        if (msg && window.MapComms?.dmUser && window.MapComms?.kind === 'dm') {
          window.MapComms.sendMessage(msg);
        } else {
          await CliHub?.startPrivateCloud?.(parts[1]);
          if (msg) window.MapComms?.sendMessage?.(msg);
        }
        return { handled: true };
      }
      if (cmd === 'contact') {
        await window.MapComms?.contactCmd?.(parts);
        return { handled: true };
      }
      if (cmd === 'msg' && parts[1]) {
        window.MapComms?.sendMessage?.(parts.slice(1).join(' '));
        return { handled: true };
      }
      if (cmd === 'city' || cmd === 'cityview') {
        await enterCityView?.();
        return { handled: true };
      }
      if (cmd === 'stars' || cmd === 'constellations' || cmd === 'constellation' || cmd === 'nav') {
        ZoomTiers?.goTo?.('global', true);
        CelestialNav?.printReport?.();
        return { handled: true };
      }
      if (cmd === 'hold' || cmd === 'pause') {
        SessionHold?.hold?.();
        return { handled: true };
      }
      if (cmd === 'resume' || cmd === 'unhold') {
        await SessionHold?.resume?.();
        return { handled: true };
      }
      if (cmd === 'stop') {
        userIntervene?.();
        return { handled: true };
      }
      if (cmd === 'youtube' || cmd === 'yt') {
        await GlobeVideo?.find?.(rest || parts.slice(1).join(' '));
        return { handled: true };
      }
      if (cmd === 'watch' || cmd === 'play') {
        const arg = rest || parts[1] || '';
        if (/^\d+$/.test(arg)) { await GlobeVideo?.playIndex?.(arg); return { handled: true }; }
        const id = GlobeVideo?.parseId?.(arg);
        if (id) { await GlobeVideo?.play?.(id, { title: arg }); return { handled: true }; }
        if (arg) await GlobeVideo?.find?.(arg);
        else ACIControl?.reply('usage: watch <url|#> · play 2');
        return { handled: true };
      }
      if (GlobeVideo?.wantsYoutube?.(raw)) {
        const q = GlobeVideo.queryFromText(raw);
        if (q) await GlobeVideo.find(q);
        return { handled: true };
      }

      if (this.devMode && !this.isStructuredCmd(cmd)) {
        await this.devBrain(raw);
        return { handled: true };
      }

      // Freeform natural language → Core Brain (local globe tools + fast AI)
      // Critical: without this, SuperCli returns handled:false and AciCli said "unknown"
      if (!this.isStructuredCmd(cmd)) {
        GlobeDeck.activeTask = 'coders';
        if (window.AstranovCoreBrain?.handle) {
          await AstranovCoreBrain.handle(raw, opts);
          return { handled: true, brain: true };
        }
        if (window.AciCoders?.handleMessage) {
          await AciCoders.handleMessage(raw, opts);
          return { handled: true, coders: true };
        }
      }
    } catch (e) {
      GlobeDeck?.setThinking(false);
      const msg = 'exec error: ' + (e.message || e);
      this.out(msg, 'err');
      GlobeDeck?.showError(msg);
      return { handled: true, error: msg };
    }

    // Last-chance freeform (any leftover tokens)
    if (raw.length >= 1) {
      GlobeDeck.activeTask = 'coders';
      if (window.AstranovCoreBrain?.handle) {
        await AstranovCoreBrain.handle(raw, opts);
        return { handled: true, brain: true };
      }
      if (window.AciCoders?.handleMessage) {
        await AciCoders.handleMessage(raw, opts);
        return { handled: true };
      }
    }
    return { handled: false };
  },
});

const _superInit = SuperCli.init.bind(SuperCli);
SuperCli.init = function () {
  _superInit();
  SuperCli.initBrain();
};
