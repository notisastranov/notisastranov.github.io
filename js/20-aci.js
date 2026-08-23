// === ASTRANOV COLLECTIVE INTELLIGENCE (ACI) — FINAL ===
// Synthesized from all AI specs: pure globe + three modes + council + self-evolving neurons.
// Single API: /functions/v1/aci (think | evolve | log | teach | stats | seed)
const SUPABASE_REF = 'lkoatrkhuigdolnjsbie';
const SUPABASE_CUSTOM_URL = 'https://api.astranov.eu';
const SUPABASE_DEFAULT_URL = 'https://' + SUPABASE_REF + '.supabase.co';
// Flip true after api.astranov.eu is activated — removes random ref from Google OAuth
const SUPABASE_USE_CUSTOM_DOMAIN = false;

var ACI = {
  name: 'Astranov',
  url: SUPABASE_USE_CUSTOM_DOMAIN ? SUPABASE_CUSTOM_URL : SUPABASE_DEFAULT_URL,
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrb2F0cmtodWlnZG9sbmpzYmllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODIwOTIsImV4cCI6MjA5NDQ1ODA5Mn0.qf6Kg93YLJ0coTdVQa4baU0ppOdFY5WkmVzMvEV6ejI',
  neurons: [],
  history: [],
  thinkMode: '',
  evolving: false,
  heartbeat: null,
  lastPulse: 0,

  async headers() {
    if (window.Auth?.authHeaders) return Auth.authHeaders();
    return { 'Content-Type': 'application/json', apikey: this.key, Authorization: 'Bearer ' + this.key };
  },

  api(body) {
    return this.headers().then(h => fetchJson(this.url + '/functions/v1/aci', {
      method: 'POST', headers: h, body: JSON.stringify(body || {})
    }, 55000));
  },

  _logQueue: [],
  _logTimer: null,
  feed(action, detail) {
    this._logQueue.push({ action, detail: detail || '', ts: Date.now() });
    if (!this._logTimer) {
      this._logTimer = setTimeout(() => {
        const batch = this._logQueue.splice(0, 8);
        this._logTimer = null;
        if (batch.length) this.api({ mode: 'log', action: 'batch', detail: batch.map(b => b.action + ':' + b.detail).join('; ').slice(0, 600) });
      }, 30000);
    }
  },

  spawnNeuron(lat, lng, strength, principle) {
    const pos = latLngToPos(lat, lng, 1.035);
    const n = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.85 })
    );
    n.position.set(pos.x, pos.y, pos.z);
    n.userData = { strength: strength || 1, id: 'neuron-' + Date.now() + Math.random(), principle: principle || '' };
    earth.add(n);
    this.neurons.push(n);
    if (window.AIGraphics) AIGraphics.spawnEffect(n.position, 0x00ffaa, 10, 20);
    return n;
  },

  syncNeuronsFromPrinciples(principles) {
    if (!Array.isArray(principles) || !principles.length) return;
    const seeds = [
      { lat: 36.22, lng: 28.12 }, { lat: 40, lng: 20 }, { lat: -15, lng: 45 },
      { lat: 55, lng: -30 }, { lat: 10, lng: -75 }, { lat: -35, lng: 140 }
    ];
    principles.slice(0, seeds.length).forEach((p, i) => {
      const s = seeds[i];
      const str = typeof p === 'string' ? 1.2 : (p.strength || p.importance || 1.2);
      const text = typeof p === 'string' ? p : (p.content || '');
      this.spawnNeuron(s.lat, s.lng, str, text);
    });
  },

  async think(prompt) {
    if (window._aciAbort) { try { window._aciAbort.abort(); } catch (_) {} }
    window._aciAbort = new AbortController();
    const up = window._lastPos || { lat: 36.22, lng: 28.12 };
    GlobeDeck?.setMapStatus('ACI — thinking…');
    GlobeDeck?.setThinking(true, 'ACI — thinking…');
    const h = await this.headers();
    let r;
    try {
      // Monitor usage: limit history to reduce tokens (from logs ~210k prompt)
      const limitedHistory = this.history.slice(-4);
      r = await fetchJson(this.url + '/functions/v1/aci', {
        method: 'POST', headers: h,
        body: JSON.stringify({ mode: 'think', prompt, history: limitedHistory, aci_mode: this.thinkMode || undefined }),
      }, 55000);
    } catch (e) {
      r = { error: String(e.message || e) };
      // Send complaint on error
      this._sendComplaint('think_error', String(e));
    }
    GlobeDeck?.setThinking(false);
    if (r.aborted) return '';
    if (r.error) {
      const err = 'ACI error: ' + r.error + (r._httpStatus === 401 ? ' — tap G to sign in' : '');
      GlobeDeck?.showError(err);
      this._sendComplaint('aci_error', err);
      return err;
    }
    const text = (r.text || r.response || '').trim() || 'Το Astranov συγκεντρώνεται — δοκίμασε ξανά.';
    this.history.push({ role: 'user', content: prompt });
    this.history.push({ role: 'assistant', content: text });
    if (this.history.length > 20) this.history = this.history.slice(-20);
    this.feed('think', prompt.slice(0, 80));
    this.pulse(1.4);
    return text;
  },

  _sendComplaint(type, detail) {
    if (window.fetch) {
      fetch('https://lkoatrkhuigdolnjsbie.supabase.co/functions/v1/debug-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: this.key },
        body: JSON.stringify({ type: 'complaint_' + type, detail, ts: Date.now(), session: window._sessionId || 'web', url: location.href })
      }).catch(() => {});
    }
  },

  async teach(content) {
    const tLat = 36.2 + (Math.random() - 0.5) * 4;
    const tLng = 28.1 + (Math.random() - 0.5) * 4;
    MapDepict.action('teach', { lat: tLat, lng: tLng, detail: content.slice(0, 50) });
    await this.api({ mode: 'teach', content });
    this.feed('teach', content.slice(0, 120));
    this.spawnNeuron(tLat, tLng, 1.4, content);
    return true;
  },

  async evolve(reason) {
    if (this.evolving) return null;
    this.evolving = true;
    MapDepict.action('evolve', { detail: reason || 'collective' });
    try {
      const r = await this.api({ mode: 'evolve', activity: reason || 'user-triggered' });
      const births = Math.max(1, Math.min(4, Number(r.brain && r.brain.new_neurons) || 1));
      for (let i = 0; i < births; i++) {
        this.spawnNeuron((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 160, 1.1 + Math.random() * 0.4);
      }
      if (r.principles && r.principles.length) this.syncNeuronsFromPrinciples(r.principles);
      if (window.AIGraphics) AIGraphics.spawnEffect(new THREE.Vector3(0, 1.2, 0), 0x00ff88, 35, 45);
      const avg = this.neurons.length ? this.neurons.reduce((s, n) => s + (n.userData.strength || 1), 0) / this.neurons.length : 1;
      idleRoll = 0.00035 * (0.5 + avg * 0.35);
      this.pulse(2.0);
      console.log('%c[ACI FINAL] evolved', 'color:#00ff88', r);
      return r;
    } finally { this.evolving = false; }
  },

  async init() {
    await this.api({ mode: 'ensure_neurons' });
    if (window._aciOwner || Auth?.isOwner) await this.api({ mode: 'seed' });
    const stats = await this.api({ mode: 'stats' });
    if (stats.principles && stats.principles.length) {
      this.syncNeuronsFromPrinciples(stats.principles.map(p => p.content || p));
    } else {
      [{ lat: 36.22, lng: 28.12 }, { lat: 40, lng: 20 }, { lat: -15, lng: 45 }, { lat: 55, lng: -30 }]
        .forEach(s => this.spawnNeuron(s.lat, s.lng, 1.2));
    }
    this.attachHeartbeat();
    console.log('%c[ACI] ready', 'color:#00ddff', stats);
  },

  attachHeartbeat() {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.008, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xaa66ff, transparent: true, opacity: 0.75 })
    );
    ring.position.set(0.75, -0.55, -1.2);
    camera.add(ring);
    this.heartbeat = ring;
  },

  pulse(scale) {
    this.lastPulse = Date.now();
    if (this.heartbeat) this.heartbeat.scale.set(scale, scale, scale);
  },

  tick() {
    if (!this.heartbeat) return;
    const t = Date.now() / 500;
    const base = 0.85 + Math.sin(t) * 0.12;
    const boost = (Date.now() - this.lastPulse < 2000) ? 0.25 : 0;
    this.heartbeat.scale.set(base + boost, base + boost, base + boost);
    this.heartbeat.material.opacity = 0.55 + Math.sin(t * 1.3) * 0.2 + boost;
  }
};
window.AstranovCollectiveIntelligence = ACI;

var SB_URL = ACI.url;
var SB_KEY = ACI.key;
window.ACI = ACI;
window.SB_URL = SB_URL;
window.SB_KEY = SB_KEY;
const sbHeaders = () => ({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' });

// ── ACI CONTROL (text + buttons — you command the collective) ──
var ACIControl = {
  init() {
    SuperCli?.init?.();
  },
  reply(text) {
    const msg = (text || '').slice(0, 280);
    if (!msg) return;
    GlobeDeck?.say(msg, 'reply');
  },

  voiceAck(msg, fromVoice) {
    if (!fromVoice || !Voice.maySpeak()) return;
    speak(String(msg || '').slice(0, 120), () => resumeListening());
  },

  async handle(text, opts = {}) {
    if (!text) return { executed: false };
    GlobeDeck?.onUserMessage('Collective — ' + text.slice(0, 36));
    const fromVoice = !!opts.fromVoice;
    const low = text.toLowerCase().trim();
    const say = (msg) => this.voiceAck(msg, fromVoice);

    const routed = await SuperCli?.exec?.(text, { fromVoice });
    if (routed?.handled) return { executed: true, action: 'supercli' };

    if (/^(hold|pause session|quiet mode|κράτα|κρατα|σίγαση|σιγαση)\b/.test(low)) {
      SessionHold?.hold?.();
      return { executed: true, action: 'hold' };
    }
    if (/^(resume|unhold|continue|συνέχισε|συνεχισε|ξανα)\b/.test(low)) {
      await SessionHold?.resume?.();
      return { executed: true, action: 'resume' };
    }
    if (SessionHold?.isHeld?.()) {
      this.reply('Session held — tap ▶ or say resume');
      say('Held. Say resume when ready.');
      return { executed: false, action: 'held' };
    }
    if (/^(stop|σταμάτα|σταματα|pause|διακοπή|quiet|σιωπή|mute)/.test(low)) {
      userIntervene();
      return { executed: true, action: 'stop' };
    }
    if (/^(cli|terminal|console|κονσόλα)$/.test(low)) { AciCli.toggle(); this.reply('CLI panel'); say('CLI.'); return { executed: true }; }
    if (/^summon\s+coders?\s*/i.test(text) || /^coders\b/i.test(low)) {
      await AciCoders?.handleMessage(text);
      return { executed: true, action: 'coders' };
    }
    if (/^(use\s+)?(grok|composer)$/.test(low) || /^switch\s+(to\s+)?(grok|composer)$/.test(low)) {
      const eng = low.match(/grok|composer/)?.[0];
      if (eng) AciCoders?.setEngine(eng);
      else AciCoders?.toggleEngine();
      ACIControl.reply('Coders: ' + (AciCoders?.engine || 'grok'));
      say('Coders ' + (AciCoders?.engine || 'grok') + '.');
      return { executed: true, action: 'coders_engine' };
    }
    if (/^(connect|open|link|σύνδεση aci)$/.test(low)) { await AciConnect.open(); return { executed: true }; }
    if (/^super batch|superbatch|batch|work together|δουλεψε μαζ|εγκατάσταση|install app|native app|node\b|μαζί/.test(low)) {
      await AstranovNode?.launchBatch?.();
      return { executed: true, action: 'batch' };
    }
    if (/^deploy/.test(low)) { await AciConnect.deploy(text.replace(/^deploy\s*/i, '')); return { executed: true }; }
    if (/^claim/.test(low)) {
      const oid = text.replace(/^claim\s*/i, '').trim();
      if (oid) await FieldBrain?.claimDelivery(oid);
      return { executed: true };
    }
    if (/^roles/.test(low)) {
      await FieldBrain?.onAuth();
      this.reply('Roles: ' + (FieldBrain?.roles || []).join(' + '));
      say('Roles synced.');
      return { executed: true };
    }
    if (/^(login|sign in|google|facebook|apple|twitter)$/.test(low) || /^σύνδεση$/.test(low)) {
      Auth.openLoginModal?.('Sign in — one account for globe and sites') || Auth.signInGoogle();
      return { executed: true };
    }
    if (/^(logout|sign out|αποσύνδεση)$/.test(low)) { Auth.signOut(); return { executed: true }; }
    if (/telecom|sat radio|satellite radio|ασύρματος/.test(low)) { Comms.startTelecomms(); return { executed: true }; }
    if (/pitogyra|πιτογυρ|μπίρ|τσιγαρ|order|παραγγελ|goals|work|δουλειά|delivery|διανομ|mpiro|tsigar|beer|cigar/.test(low)) {
      const q = text.replace(/^(order|παραγγελία?)\s*/i, '').trim();
      const wants = Commerce.parseWantedItems?.(q) || [];
      if (wants.length >= 1 && !/^goals$/i.test(q.trim())) {
        await Commerce.smartOrder(q || text);
      } else {
        const vendorQ = low.match(/goals|πιτο|pit|pizza|supermarket|bar/)?.[0] || '';
        await Commerce.openOrderFlow(vendorQ || q);
      }
      return { executed: true, action: 'order' };
    }
    if (/^drive|οδήγ|οδηγ/.test(low)) {
      if (window.DrivingView) DrivingView.activate();
      MapDepict.action('drive', { detail: 'road mode' });
      this.reply('Driving view on globe');
      say('Driving.');
      return { executed: true, action: 'drive' };
    }
    if (/vhf|ασυρμ/.test(low) && !/video|βίντεο|youtube/.test(low)) { Comms.startVHF(); return { executed: true }; }
    if (/phone|τηλέφων/.test(low) && !/video|βίντεο|youtube/.test(low)) { Comms.startPhone(); return { executed: true }; }
    if (GlobeVideo?.wantsYoutube?.(text)) {
      const q = GlobeVideo.queryFromText(text) || text;
      await GlobeVideo.find(q);
      return { executed: true, action: 'youtube' };
    }
    if (/video\s+call|orbital\s+video|κλήση\s+βίντεο/.test(low)) {
      MapDepict.action('video', { detail: 'Αξαδίνα' });
      startOrbitalVideoCall('Αξαδίνα');
      return { executed: true, action: 'video' };
    }
    if (/news|νέα|ειδήσει/.test(low)) { NewsFeed.flash(); return { executed: true }; }
    if (/vendor|κατάστη|shop|menu|μενού/.test(low) && !/superbook|booking site|web presence|my site|\.astranov\.eu/.test(low)) {
      await Commerce.showPicker();
      return { executed: true };
    }
    if (/astranov\s*sites?|superbook|booking site|web presence|my site|create.*site|make.*site|\.astranov\.eu|astranov subdomain/.test(low)) {
      if (!Auth?.user) { Auth.openLoginModal?.('Sign in — then ask for your Astranov Site'); this.reply('Sign in — then ask again for your Astranov Site'); return { executed: true }; }
      try {
        const prov = window.AstranovSitesProvision || window.SuperBookingProvision;
        const parsed = prov.parseAsk(text);
        await prov.provision(parsed);
      } catch (e) {
        this.reply(e.message || 'Site creation failed');
      }
      return { executed: true, action: 'site_provision' };
    }
    if (/explore|εξερεύ|πήγαινε|go to|focus/.test(low)) {
      requestLocationIfNeeded(() => {
        const lat = 35 + Math.random() * 10;
        const lng = 25 + Math.random() * 10;
        const p = latLngToPos(lat, lng);
        MapDepict.action('explore', { lat, lng, detail: 'explore' });
        focusOnGlobePoint(new THREE.Vector3(p.x, p.y, p.z));
        this.reply('Exploring ' + lat.toFixed(2) + ', ' + lng.toFixed(2));
        say('Exploring.');
      });
      return { executed: true, action: 'explore' };
    }
    if (/request.*tech|orbital tech|technology|τεχνολογ/.test(low)) {
      requestOrbitalTech();
      say('Request copied.');
      return { executed: true };
    }
    if (/english|αγγλικά/.test(low)) {
      Voice.preferredListenLang = 'en-US';
      if (recognition) recognition.lang = 'en-US';
      MapDepict.action('mode', { detail: 'English listen' });
      say('English.');
      return { executed: true };
    }
    if (/ελληνικά|greek/.test(low)) {
      Voice.preferredListenLang = 'el-GR';
      if (recognition) recognition.lang = 'el-GR';
      MapDepict.action('mode', { detail: 'Greek listen' });
      say('Greek.');
      return { executed: true };
    }
    if (/athenian|αθηναϊκ/.test(low)) {
      ACI.thinkMode = 'athenian';
      MapDepict.action('mode', { detail: 'athenian' });
      say('Athenian mode.');
      return { executed: true };
    }
    if (/spartan|σπαρτιατ/.test(low)) {
      ACI.thinkMode = 'spartan';
      MapDepict.action('mode', { detail: 'spartan' });
      say('Spartan mode.');
      return { executed: true };
    }
    if (/myrmidon|μυρμιδόν/.test(low)) {
      ACI.thinkMode = 'myrmidon';
      MapDepict.action('mode', { detail: 'myrmidon' });
      say('Myrmidon mode.');
      return { executed: true };
    }
    if (/^(remember|θυμήσου|να θυμάσαι)/.test(low)) {
      const content = text.replace(/^(remember|θυμήσου|να θυμάσαι)[:,]?\s*/i, '').trim();
      await ACI.teach(content || text);
      say('Remembered.');
      return { executed: true };
    }
    if (/evolve|neuron|collective|εξέλιξη|brain/.test(low)) {
      await ACI.evolve('user-command');
      this.reply('Collective evolved on globe.');
      say('Evolved.');
      return { executed: true };
    }
    if (/^(mic|voice|μίκροφωνο|ακού)/.test(low)) {
      startVoiceOptions();
      return { executed: true };
    }

    if (low.length < 4) {
      this.reply('Use globe gestures · or open ' + (AstroGlyphs?.cli || '💻') + ' CLI · or say order, explore, stop');
      if (fromVoice) say('Say order, explore, or stop.');
      return { executed: false };
    }

    await AciCoders?.handleMessage(text);
    return { executed: true, action: 'coders' };
  }
};
window.ACIControl = ACIControl;
