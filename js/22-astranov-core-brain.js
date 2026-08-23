// === ASTRANOV CORE BRAIN — local-first globe agent + fast AI ===
// Rebuild 2026-07-16: freeform chat was dying as "unknown — try help".
// Design: act on the globe immediately → answer in-app → enrich with AI when ready.
// Never wait 80s for edge before the user sees a result.
const AstranovCoreBrain = {
  version: '20260716-core',
  history: [],
  busy: false,
  AI_TIMEOUT_MS: 14000,
  CITIES: {
    athens: [37.9838, 23.7275], athina: [37.9838, 23.7275],
    rhodes: [36.4341, 28.2176], rodos: [36.4341, 28.2176],
    thessaloniki: [40.6401, 22.9444], salonika: [40.6401, 22.9444],
    london: [51.5074, -0.1278], paris: [48.8566, 2.3522],
    berlin: [52.52, 13.405], rome: [41.9028, 12.4964],
    newyork: [40.7128, -74.006], tokyo: [35.6762, 139.6503],
    istanbul: [41.0082, 28.9784], cairo: [30.0444, 31.2357],
    dubai: [25.2048, 55.2708], sydney: [-33.8688, 151.2093],
  },

  init() {
    if (this._inited) return;
    this._inited = true;
    window.AstranovCoreBrain = this;
    console.log('%c[AstranovCoreBrain] local-first globe agent live', 'color:#00e8ff;font-weight:700');
  },

  userPos() {
    return window._lastPos || { lat: 36.4341, lng: 28.2176 };
  },

  /** Classify intent → globe tools. Always runnable offline. */
  plan(message) {
    const m = String(message || '').trim();
    const low = m.toLowerCase();
    const greek = /[\u0370-\u03FF]/.test(m);
    const actions = [];
    let intent = 'chat';

    // Locate / me
    if (/locate|where am i|find me|gps|βρες με|πού είμαι|που ειμαι|🎯|📍/i.test(low)
      || /^(me|here)$/i.test(low)) {
      intent = 'locate';
      actions.push({ type: 'locate' });
    }

    // City map
    if (/city\s*(view|map|level)?|street\s*view|πόλη|πολη|καταστήματα|shops near/i.test(low)
      && !/locate|where am i/i.test(low)) {
      intent = 'city';
      actions.push({ type: 'city' });
    }

    // Fly to named city
    for (const [name, ll] of Object.entries(this.CITIES)) {
      if (new RegExp('\\b' + name + '\\b', 'i').test(low)
        || (name === 'athens' && /αθήνα|αθηνα|αθ[ήη]να/.test(low))
        || (name === 'rhodes' && /ρόδο|ροδο|ρόδος/.test(low))) {
        intent = 'fly';
        actions.push({ type: 'fly', lat: ll[0], lng: ll[1], label: name });
        break;
      }
    }

    // Zoom tiers
    if (/\b(global|earth|world|κόσμος|κοσμος)\b/i.test(low) && /zoom|show|go|view|δείξε|δειξε/i.test(low)) {
      intent = 'zoom';
      actions.push({ type: 'zoom', tier: 'global' });
    } else if (/\bnational|country|χώρα|χωρα\b/i.test(low) && /zoom|view|go/i.test(low)) {
      intent = 'zoom';
      actions.push({ type: 'zoom', tier: 'national' });
    } else if (/\bsolar|galaxy|space|διάστημα|διαστημα\b/i.test(low) && /zoom|view|go|show/i.test(low)) {
      intent = 'zoom';
      actions.push({ type: 'zoom', tier: 'solar' });
    }

    // Order / shops
    if (/order|buy|shop|vendor|παραγγελ|φαγητ|πίτα|πιτα|gyro|delivery|deliver/i.test(low)) {
      intent = 'commerce';
      actions.push({ type: 'commerce', query: m });
    }

    // News
    if (/news|ειδήσ|ειδησ|headline/i.test(low)) {
      intent = 'news';
      actions.push({ type: 'news' });
    }

    // Think / evolve brain visuals
    if (/think|evolve|brain|μυαλό|μυαλο|εξέλιξ|εξελιξ/i.test(low) && m.length < 80) {
      intent = intent === 'chat' ? 'brain' : intent;
      actions.push({ type: 'brain_pulse', mode: /evolve|εξέλιξ/i.test(low) ? 'evolve' : 'think' });
    }

    // SpaceX / video tiles on globe
    if (/spacex\s*video|video\s*tile|globe\s*video|show\s*spacex|tiles?\s*on\s*globe/i.test(low)
      || (/spacex/.test(low) && /video|watch|live|tile/.test(low))) {
      intent = 'video_tiles';
      actions.push({ type: 'video_tiles', query: m });
    }

    // Starship Flight 13 sim
    if (/starship|flight\s*13|f13|starbase\s*launch|ift[\s-]*13/i.test(low)) {
      intent = 'starship';
      actions.push({ type: 'starship', query: m });
    }

    // Starlink / SpaceX sats on globe
    if (/starlink|spacex\s*sat|leo\s*constellation|satellite\s*(map|orbit|show)|constellation/i.test(low)
      && !/starship|flight\s*13/i.test(low)) {
      intent = 'starlink';
      actions.push({ type: 'starlink', query: m });
    }

    // Resource monitor / donate
    if (/\b(resource|resources|donate|donation|monitor|cpu\s*share|max\s*load)\b/i.test(low)) {
      intent = 'resources';
      actions.push({ type: 'resources', query: m });
    }

    // SpaceNet channel manager (field hub — no third-party brands)
    if (/\b(channels?|spacenet\s*cm|field\s*kitchen|publish\s*place|catalog\s*sync)\b/i.test(low)
      || /^cm\b/i.test(low)) {
      intent = 'spacenet_cm';
      actions.push({ type: 'spacenet_cm', query: m });
    }

    // SpaceNet crawlers
    if (/spacenet|crawl(er|ers)?|ingest|scan\s*(city|area|sector)/i.test(low)
      && intent !== 'spacenet_cm') {
      intent = 'spacenet';
      actions.push({ type: 'spacenet', query: m });
    }

    // City tasks DNA: delivery · jobs · errands · dating
    if (/\b(city\s*task|task\s*list|claim\s*(delivery|order|task|job|date)|assign\s*driver)\b/i.test(low)
      || (/^task\b/i.test(low))
      || /\b(barman|bartender|housekeeper|nanny|cleaner|errand|hire\s+a|need\s+a\s+\w+)\b/i.test(low)
      || /\b(date|dating|coffee\s*date|dinner\s*date)\b/i.test(low)
      || /\b(gig|job\s+for|work\s+for\s+\d)\b/i.test(low)) {
      intent = 'city_task';
      actions.push({ type: 'city_task', query: m });
    }

    // Hello / ping — no globe required
    if (/^(hi|hello|hey|ping|γεια|γεια σου|είσαι εκεί|eisai ekei)\b/i.test(low) || this._isPing(m)) {
      intent = 'ping';
    }

    return { message: m, low, greek, intent, actions };
  },

  _isPing(m) {
    const s = String(m || '').trim();
    if (!s || s.length > 60) return false;
    return /^(are you there|you there|hello|hi|hey|ping|online|listening|grok|astranov|γεια|είσαι|ακούς|παρών|εδώ)/i.test(s);
  },

  async execute(plan) {
    const results = [];
    for (const a of plan.actions) {
      try {
        if (a.type === 'locate') {
          AIGraphics?.setThinkPulse?.(true);
          MapDepict?.action?.('location', { detail: 'locate' });
          if (typeof SuperCli?.run === 'function') await SuperCli.run('locate');
          else if (CityLife?.locateAndDropIn) await CityLife.locateAndDropIn();
          else if (window._lastPos) {
            GlobeControl?.flyToLatLng?.(window._lastPos.lat, window._lastPos.lng, 'you', GlobeControl?.Z?.national, {});
          }
          results.push('located');
        } else if (a.type === 'city') {
          const p = this.userPos();
          MapDepict?.pulse?.(p.lat, p.lng, 0x00e8ff, 'city', 8000);
          await enterCityView?.(p.lat, p.lng);
          results.push('city map');
        } else if (a.type === 'fly') {
          AIGraphics?.flyAstranovTo?.(a.lat, a.lng, { color: 0x3d9eff });
          GlobeControl?.flyToLatLng?.(a.lat, a.lng, a.label, GlobeControl?.Z?.national, {});
          MapDepict?.pulse?.(a.lat, a.lng, 0x00ddff, a.label, 10000);
          MapDepict?.action?.('explore', { lat: a.lat, lng: a.lng, detail: a.label });
          results.push('flew to ' + a.label);
        } else if (a.type === 'zoom') {
          ZoomTiers?.goTo?.(a.tier, true);
          results.push('zoom ' + a.tier);
        } else if (a.type === 'commerce') {
          MapDepict?.action?.('order', { detail: a.query?.slice(0, 40) });
          await LazyModules?.ensure?.();
          if (window.Commerce?.openOrderFlow) await Commerce.openOrderFlow(a.query || '');
          else if (Commerce?.showPicker) await Commerce.showPicker();
          results.push('shops');
        } else if (a.type === 'news') {
          MapDepict?.action?.('news', {});
          Comms?.loadNews?.();
          results.push('news');
        } else if (a.type === 'brain_pulse') {
          const p = this.userPos();
          MapDepict?.action?.(a.mode === 'evolve' ? 'evolve' : 'think', { lat: p.lat, lng: p.lng, detail: plan.message.slice(0, 40) });
          AIGraphics?.setThinkPulse?.(true);
          AIGraphics?.showNeural?.(true);
          if (a.mode === 'evolve') ACI?.evolve?.(plan.message).catch(() => {});
          else ACI?.pulse?.(1.6);
          results.push(a.mode);
        } else if (a.type === 'video_tiles') {
          GlobeInfoTiles?.init?.();
          const msg = await GlobeInfoTiles?.handleCli?.(a.query || 'spacex');
          results.push(msg || 'video tiles');
        } else if (a.type === 'starship') {
          StarshipFlight13?.init?.();
          GlobeInfoTiles?.init?.();
          void GlobeInfoTiles?.refreshSpaceXVideos?.({ fly: false });
          const msg = await StarshipFlight13?.handleCli?.(a.query || 'starship');
          results.push(msg || 'starship f13');
        } else if (a.type === 'starlink') {
          StarlinkConstellation?.init?.();
          const msg = await StarlinkConstellation?.handleCli?.(a.query || 'starlink');
          results.push(msg || 'starlink');
        } else if (a.type === 'resources') {
          ResourceMonitor?.init?.();
          const msg = ResourceMonitor?.handleCli?.(a.query || 'resources');
          results.push(msg || 'resources');
        } else if (a.type === 'spacenet_cm') {
          SpaceNetCM?.init?.();
          const msg = SpaceNetCM?.handleCli?.(a.query || 'channels status');
          results.push(msg || 'spacenet cm');
        } else if (a.type === 'spacenet') {
          const p = this.userPos();
          const msg = await SpaceNetBrain?.handleCli?.(a.query || 'crawl');
          void SpaceNetBrain?.crawlAll?.(p.lat, p.lng, 3, { force: /force|now/i.test(a.query || '') });
          results.push(msg || 'spacenet crawl');
        } else if (a.type === 'city_task') {
          CityTasks?.init?.();
          const msg = await CityTasks?.handleCli?.(a.query || 'task list');
          results.push(msg || 'city task');
        }
      } catch (e) {
        results.push(a.type + ' failed');
      }
    }
    return results;
  },

  localReply(plan, actionResults) {
    const greek = plan.greek;
    const acted = (actionResults || []).filter(Boolean);
    if (plan.intent === 'ping') {
      return greek
        ? 'Ναι — Astranov εδώ. Μίλα κανονικά: locate, Athens, order, ή ό,τι θες στο globe.'
        : 'Yes — Astranov online. Speak or type: locate, fly Athens, order, zoom global.';
    }
    if (acted.length) {
      const what = acted.join(' · ');
      return greek
        ? 'Έγινε στο globe: ' + what + '. Πες επόμενο βήμα.'
        : 'Done on the globe: ' + what + '. What next?';
    }
    if (plan.intent === 'chat') {
      return greek
        ? 'Άκουσα: «' + plan.message.slice(0, 80) + '». Σκέφτομαι… (μπορείς locate / fly / order χωρίς AI).'
        : 'Got it: «' + plan.message.slice(0, 80) + '». Thinking… (you can also say locate / fly / order).';
    }
    return greek ? 'Εντάξει — πες locate, fly, order, ή ρώτα με.' : 'OK — say locate, fly, order, or ask me anything.';
  },

  /** Fast AI via aicycle (lighter than aci coders_chat). Race timeout. */
  async askAi(message, plan) {
    const headers = await (Auth?.authHeaders?.() || Promise.resolve({
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
    }));
    const systemBits = [
      'You are Astranov — SpaceNet globe OS AI. Spartan, real, same language as user.',
      'User can act on a 3D Earth (locate, fly cities, order, zoom).',
      'If they asked something you cannot do in text, say the CLI phrase they should type.',
      'Max 2 short sentences. No markdown lists.',
    ];
    if (plan.actions.length) {
      systemBits.push('Already executed on globe: ' + plan.actions.map(a => a.type).join(', ') + '. Confirm briefly.');
    }
    const body = {
      mode: 'chat',
      message: String(message).slice(0, 900),
      system: systemBits.join(' '),
      history: this.history.slice(-6),
      fast: true,
      fallback_prefs: { force: 'groq', skip: [] },
    };
    const url = (typeof SB_URL !== 'undefined' ? SB_URL : ACI?.url) + '/functions/v1/aicycle';
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => { try { ctrl?.abort(); } catch (_) {} }, this.AI_TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', apikey: headers.apikey || SB_KEY },
        body: JSON.stringify(body),
        signal: ctrl?.signal,
      });
      const j = await r.json().catch(() => ({}));
      const text = String(j.text || j.response || '').trim();
      if (!text || /gathering itself|warming up|try again|no model/i.test(text)) return null;
      return { text: text.slice(0, 500), via: j.via || j.provider || 'aicycle' };
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  },

  deliver(text, opts = {}) {
    const shown = String(text || '').slice(0, 500);
    if (!shown) return;
    AciCli?.print?.(shown, opts.kind || 'reply');
    ACIControl?.reply?.(shown.slice(0, 280));
    GlobeDeck?.setPreview?.(shown.slice(0, 140));
    CliRibbon?.setNotice?.(shown.slice(0, 100), opts.kind === 'err' ? 'err' : 'ready');
    CliRibbon?.setActive?.('Astranov');
    if (opts.speak && (window._handsFreeVoice || voiceSessionActive) && Voice?.shouldSpeak?.(shown)) {
      speak(shown.slice(0, 160), () => resumeListening?.(), false);
    } else if (window._handsFreeVoice || voiceSessionActive) {
      scheduleVoiceResume?.();
    }
  },

  /**
   * Main entry — freeform user message from CLI or voice.
   * Returns same shape as AciCoders.chat for compatibility.
   */
  async handle(message, opts = {}) {
    this.init();
    const raw = String((window.fixVoiceHotwords || (x => x))(String(message || ''))).trim();
    if (!raw) {
      await AciCoders?.enterSession?.({ fromVoice: !!opts.fromVoice, focus: true });
      return { ok: true, session: true };
    }

    // Architect bridge / coders explicit — keep existing routes
    if (ArchitectBridge?.wantsBridgeCmd?.(raw)) {
      return ArchitectBridge.handleCommand(raw);
    }
    if (AciCoders?.isExplicitRef?.(raw) && AciCoders?.isArchitect?.()) {
      return AciCoders.handleMessage(raw, opts);
    }

    if (this.busy) {
      this.deliver(this.localReply({ greek: /[\u0370-\u03FF]/.test(raw), message: raw, intent: 'chat', actions: [] }, []), { kind: 'dim' });
    }
    this.busy = true;
    GlobeDeck?.expand?.('Astranov');
    GlobeDeck?.setThinking?.(true, 'Astranov…');
    CliRibbon?.setActive?.('Astranov');
    AIGraphics?.setThinkPulse?.(true);

    try {
      const plan = this.plan(raw);
      const actionResults = await this.execute(plan);
      const instant = this.localReply(plan, actionResults);
      this.history.push({ role: 'user', content: raw });
      this.history.push({ role: 'assistant', content: instant });
      if (this.history.length > 24) this.history = this.history.slice(-24);

      // Always show something now (local-first)
      this.deliver(instant, {
        kind: 'reply',
        speak: !!(opts.fromVoice || window._handsFreeVoice),
      });
      GlobeDeck?.setThinking?.(false);

      // Pure action intents don't need slow AI
      if (plan.intent !== 'chat' && plan.actions.length && plan.intent !== 'brain') {
        FieldBrain?.pulse?.('act', plan.intent, { props: { results: actionResults } });
        return { ok: true, text: instant, via: 'local/globe', actions: actionResults, local: true };
      }

      // Enrich chat with AI — do not block more than AI_TIMEOUT_MS
      const ai = await this.askAi(raw, plan);
      if (ai?.text && ai.text !== instant) {
        // Replace last assistant history with richer reply
        this.history[this.history.length - 1] = { role: 'assistant', content: ai.text };
        this.deliver(ai.text, {
          kind: 'reply',
          speak: !!(opts.fromVoice || window._handsFreeVoice),
        });
        FieldBrain?.pulse?.('think', raw.slice(0, 48), {});
        MapDepict?.action?.('think', { detail: raw.slice(0, 40) });
        return { ok: true, text: ai.text, via: ai.via, actions: actionResults };
      }

      return { ok: true, text: instant, via: 'local/first', actions: actionResults, local: true };
    } catch (e) {
      const err = 'Brain error: ' + (e.message || e);
      this.deliver(err, { kind: 'err' });
      return { ok: false, error: err, text: err };
    } finally {
      this.busy = false;
      GlobeDeck?.setThinking?.(false);
      setTimeout(() => AIGraphics?.setThinkPulse?.(false), 900);
    }
  },
};

window.AstranovCoreBrain = AstranovCoreBrain;
