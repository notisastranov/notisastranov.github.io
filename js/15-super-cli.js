// === SUPER CLI — one window: toolbar + log + stage + input ===
// Public: "Astranov". Architect only: mission CLI tone.
const ACL_TITLE = 'Astranov';

const SuperCli = {
  _bound: false,
  _context: 'idle',
  get title() {
    return window.PublicCopy?.deckTitle?.() || 'Astranov';
  },

  // Trust bar: Sign-in · Locate · + · AI (provider/order available but may be CSS-hidden)
  TOOLBAR_VISIBLE: ['aci-login', 'aci-locate', 'aci-handsfree', 'aci-bridge', 'super-add-fab', 'aci-provider', 'aci-order'],
  INPUT_BTNS: ['globe-deck-send'],

  init() {
    if (this._bound) return;
    this._bound = true;
    this.bindToolbar();
    this.bindInputBar();
    this.setContext(this.inferContext());
    CliRibbon?.setActive?.('CLI');
  },

  inferContext() {
    if (window.ContextTruth?.infer) return window.ContextTruth.infer().ctx;
    if (window.DrivingView?.active) return 'drive';
    const task = GlobeDeck?.activeTask;
    if (task === 'commerce') return 'commerce';
    if (task === 'batch') return 'batch';
    if (task === 'radio') return 'radio';
    if (task === 'phone') return 'phone';
    if (task === 'add') return 'add';
    if (task === 'coders') return 'coders';
    if (task === 'chats') return 'chats';
    if (!Auth?.user) return 'guest';
    return 'idle';
  },

  setContext(ctx) {
    this._context = ctx || 'idle';
    const bar = document.getElementById('super-cli-bar');
    if (!bar) return;
    bar.dataset.ctx = this._context;
    const allowed = new Set(this.TOOLBAR_VISIBLE);
    bar.querySelectorAll('button').forEach(btn => {
      if (btn.classList.contains('app-shortcut-btn') && btn.id !== 'aci-locate') return;
      if (btn.id === 'aci-bridge') {
        btn.hidden = !(Auth?.isArchitect && allowed.has('aci-bridge'));
        return;
      }
      // Always keep locate + handsfree + + visible
      if (btn.id === 'aci-locate' || btn.id === 'aci-handsfree' || btn.id === 'super-add-fab' || btn.id === 'aci-login') {
        btn.hidden = false;
        btn.style.display = 'inline-flex';
        return;
      }
      if (btn.id === 'aci-video-call') {
        btn.hidden = false;
        return;
      }
      btn.hidden = !allowed.has(btn.id);
    });
    // Rescue locate if parked in hidden shortcut row
    const loc = document.getElementById('aci-locate');
    const edge = document.getElementById('super-cli-edge-right');
    const badRow = document.getElementById('app-shortcut-row');
    if (loc && edge && badRow?.contains(loc)) {
      const hf = document.getElementById('aci-handsfree');
      if (hf && edge.contains(hf)) edge.insertBefore(loc, hf);
      else edge.prepend(loc);
      loc.classList.remove('app-shortcut-btn');
      loc.hidden = false;
    }
    AppShortcuts?.render?.();
    this.INPUT_BTNS.forEach(id => {
      const b = document.getElementById(id);
      if (b) b.hidden = false;
    });
  },

  bindInputBar() {
    const hf = document.getElementById('aci-handsfree');
    const send = document.getElementById('globe-deck-send');
    if (hf && !hf._superBound) {
      hf._superBound = true;
      hf.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        // Contract: 🎧 = open AI panel. Never locate / fly / zoom.
        if (SessionHold?.isHeld?.()) { SessionHold.resume(); return; }
        if (Voice?.speaking || isListening || voiceSessionActive || window._handsFreeVoice) {
          userIntervene?.();
          AciCli?.print('🎧 voice stopped — type below or tap 🎧 again', 'dim');
          return;
        }
        void this.openAiHandsfree();
      };
    }
    if (send && !send._superBound) {
      send._superBound = true;
      send.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        AciCli?.submitFromInput?.({ emptyFocus: true });
      };
    }
  },

  /** 🎧 trust path: expand CLI + Grok session (text). Voice only if already welcomed. */
  async openAiHandsfree() {
    GlobeDeck?.expand?.(ACL_TITLE);
    GlobeDeck?.onUserMessage?.('Grok');
    CliRibbon?.setActive?.('Grok');
    CliRibbon?.setNotice?.('Grok ready — type or speak', 'ready');
    GlobeDeck?.setPreview?.('Talk to Grok — type below or speak after mic starts');
    document.getElementById('aci-cli-in')?.focus();
    try {
      await AciCoders?.enterSession?.({ expand: true, focus: true, ping: false });
    } catch (_) { /* */ }
    // Start voice after UI is open — never call locateMe from this path
    if (typeof startVoiceOptions === 'function' && !window._handsFreeVoice) {
      try { startVoiceOptions(); } catch (_) { /* */ }
    }
  },

  bindToolbar() {
    const actions = {
      'aci-login': () => Auth?.user ? Auth.openLoggedInProfile() : (Auth?.signInGoogle?.() || Auth?.openLoginModal?.()),
      'aci-cli-toggle': () => GlobeDeck?.toggle(),
      'aci-stop': () => userIntervene?.(),
      'aci-hold': () => SessionHold?.toggle?.(),
      'aci-theme': () => AstranovTheme?.toggle?.(),
      'aci-locate': () => this.run('locate'),
      'aci-bridge': () => ArchitectBridge?.openQuickFix?.(),
      'aci-provider': () => AiRouter?.cycle?.(),
      'aci-order': () => this.run('order'),
      'aci-batch': () => this.run('batch'),
      'aci-vhf': () => this.run('vhf'),
      'aci-call': () => this.run('phone'),
      'super-add-fab': () => {
        if (window.MultiTile?.openFromPlus) {
          MultiTile.openFromPlus();
          return;
        }
        if (typeof MapPlaceMenu?.openPlusField === 'function') {
          MapPlaceMenu.openPlusField();
          return;
        }
        this.run('add');
      },
    };
    Object.entries(actions).forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (el) el.onclick = e => { e.preventDefault(); e.stopPropagation(); fn(); };
    });
  },

  flyForTask(act, opts) {
    if (!GlobeControl?.isEarthView?.()) return;
    const u = window._lastPos || { lat: 36.22, lng: 28.12 };
    if (act === 'news') {
      const u = window._lastPos || { lat: 36.44, lng: 28.22 };
      GlobeControl.flyToLatLng(opts?.worldLat ?? u.lat, opts?.worldLng ?? u.lng, 'news', GlobeControl?.Z?.global);
      return;
    }
    if (act === 'order' || act === 'commerce') {
      const v = window.Commerce?.vendors?.[0] || window.Commerce?.selected;
      if (v?.lat != null) GlobeControl.flyToLatLng(v.lat, v.lng, 'order');
      else GlobeControl.flyToLatLng(u.lat, u.lng, 'order');
      return;
    }
    if (act === 'batch') GlobeControl.flyToLatLng(u.lat, u.lng, 'batch');
    if (act === 'vhf' || act === 'radio') GlobeControl.flyToLatLng(u.lat, u.lng, 'comms');
  },

  async run(action, opts) {
    const act = String(action || '').toLowerCase();
    SlumberManager?.wakeForAction?.(act);
    if (!['locate', 'city', 'map', 'cli', 'dark', 'bright', 'theme', 'slumber', 'wake', 'sleep'].includes(act)) {
      await LazyModules.ensure();
    }
    GlobeDeck?.superAction(act, opts);
    this.setContext(this.inferContext());
    AciCli?.print('▸ ' + act, 'cmd');

    switch (act) {
      case 'locate':
        if (GlobeControl?.followMode === 'locate' && !GlobeControl?.userExploring) {
          GlobeControl.userTookGlobe('locate-off');
          AciCli?.print('Locate released — globe is yours', 'ok');
          break;
        }
        GlobeDeck?.expand?.(ACL_TITLE);
        try {
          if (CityLife?.locateAndDropIn) await CityLife.locateAndDropIn();
          else locateMe?.();
        } catch (_) {
          try { await enterCityView?.(36.44, 28.22, { openShops: false }); } catch (__) {}
        }
        GlobeDeck?.finishCliIfOneShot('locate');
        break;
      case 'city':
      case 'map':
        GlobeDeck?.expand?.(ACL_TITLE);
        GlobeDeck?.setMapStatus('Opening city map…');
        await enterCityView?.(null, null, { openShops: true });
        GlobeDeck?.finishCliIfOneShot('city');
        break;
      case 'order':
        this.flyForTask('order');
        await LazyModules?.ensure?.().catch(() => {});
        await window.Commerce?.showPicker?.(opts?.filter);
        this.setContext('commerce');
        break;
      case 'batch':
        this.flyForTask('batch');
        await window.AstranovNode?.launchBatch?.();
        this.setContext('batch');
        break;
      case 'vhf':
      case 'radio':
      case 'pmr':
        this.flyForTask('vhf');
        window.Comms?.startVHF?.();
        this.setContext('radio');
        break;
      case 'phone':
      case 'call':
        GlobeDeck?.hideStage();
        GlobeDeck.activeTask = 'phone';
        GlobeDeck?.expand(ACL_TITLE + ' — phone');
        AppShortcuts?.track?.('phone', 'Phone');
        this.setContext('phone');
        AciCli?.print('Type: call +30… (e.g. call +306912345678)', 'ok');
        ACIControl?.reply('Type call +number in chat');
        document.getElementById('aci-cli-in')?.focus();
        break;
      case 'news':
        this.flyForTask('news', opts);
        window.NewsFeed?.flash?.();
        this.setContext('news');
        GlobeDeck?.finishCliIfOneShot('news');
        break;
      case 'drive':
        window.DrivingView?.activate?.();
        AppShortcuts?.track?.('drive', 'Drive');
        this.setContext('drive');
        break;
      case 'add':
      case 'post':
      case 'superadd':
        window.SuperAdd?.open?.();
        this.setContext('add');
        break;
      case 'cli':
        GlobeDeck?.expand(ACL_TITLE);
        document.getElementById('aci-cli-in')?.focus();
        break;
      default:
        if (AciCli && act) await AciCli.run(act + (opts?.rest ? ' ' + opts.rest : ''));
    }
  },
};
window.SuperCli = SuperCli;
