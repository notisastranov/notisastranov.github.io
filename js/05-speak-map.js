// === VOICE + MAP DEPICT ===
// Astranov Voice: ONE calm female persona, ONE utterance at a time (queued).
// Server TTS preferred; browser fallback only if server unavailable.

const Voice = {
  persona: { name: 'Astranov', style: 'female calm mid-tone' },
  voices: [],
  ready: false,
  speaking: false,
  stopped: false,
  preferredListenLang: 'el-GR',
  _voicesReady: null,
  _audio: null,
  _blobUrl: null,
  _gen: 0,
  _queue: Promise.resolve(),
  engine: 'astranov',

  init() {
    const load = () => {
      this.voices = speechSynthesis.getVoices().filter(v => v.lang);
      if (this.voices.length) this.ready = true;
    };
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    setTimeout(load, 400);
    setTimeout(load, 1200);
  },

  ensureVoices() {
    if (!this._voicesReady) {
      this._voicesReady = new Promise(resolve => {
        const done = () => {
          this.voices = speechSynthesis.getVoices().filter(v => v.lang);
          this.ready = this.voices.length > 0;
          resolve();
        };
        done();
        speechSynthesis.addEventListener('voiceschanged', done, { once: true });
        setTimeout(done, 800);
      });
    }
    return this._voicesReady;
  },

  detectLang(s) {
    if (ArcangeloDialect?.looksMixed?.(s) || ArcangeloDialect?.detect?.(s)?.active) return 'el-GR';
    const g = (s.match(/[\u0370-\u03FF\u1F00-\u1FFF]/g) || []).length;
    const l = (s.match(/[a-zA-Z]/g) || []).length;
    return g >= l * 0.25 ? 'el-GR' : 'en-US';
  },

  pickFemaleCalm(lang) {
    const v = this.voices;
    if (!v.length) return null;
    const isFemale = x => /female|zira|samantha|susan|hazel|aria|victoria|linda|karen|moira|fiona|tessa|melina|elena|google.*γυναικ|natural.*female/i.test(x.name);
    if (lang === 'el-GR') {
      return v.find(x => isFemale(x) && /el/i.test(x.lang))
        || v.find(x => /melina|elena|ελληνικά/i.test(x.name))
        || v.find(x => /^el[-_]?GR$/i.test(x.lang) && !/stefanos|male|nikos/i.test(x.name));
    }
    return v.find(x => isFemale(x) && /^en/i.test(x.lang))
      || v.find(x => /zira|samantha|hazel|aria|victoria/i.test(x.name))
      || v.find(x => /^en[-_]?US$/i.test(x.lang));
  },

  hasGreekVoice() {
    return !!this.pickFemaleCalm('el-GR');
  },

  /** Browser TTS without a Greek voice spells Α→Α Κ Ο… — romanize instead */
  romanizeGreek(text) {
    const map = {
      α: 'a', ά: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', έ: 'e', ζ: 'z', η: 'i', ή: 'i',
      θ: 'th', ι: 'i', ί: 'i', ϊ: 'i', ΐ: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x',
      ο: 'o', ό: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', ύ: 'y', φ: 'f',
      χ: 'ch', ψ: 'ps', ω: 'o', ώ: 'o',
      Α: 'A', Ά: 'A', Β: 'V', Γ: 'G', Δ: 'D', Ε: 'E', Έ: 'E', Ζ: 'Z', Η: 'I', Ή: 'I',
      Θ: 'Th', Ι: 'I', Ί: 'I', Κ: 'K', Λ: 'L', Μ: 'M', Ν: 'N', Ξ: 'X', Ο: 'O', Ό: 'O',
      Π: 'P', Ρ: 'R', Σ: 'S', Τ: 'T', Υ: 'Y', Ύ: 'Y', Φ: 'F', Χ: 'Ch', Ψ: 'Ps', Ω: 'O', Ώ: 'O',
    };
    return String(text || '').split('').map(c => map[c] || c).join('');
  },

  prepareForSpeech(text) {
    let s = this.humanize(text).slice(0, 420);
    if (!s) return { text: '', lang: 'en-US', speak: false };
    let lang = this.detectLang(s);
    const hasGreek = /[\u0370-\u03FF\u1F00-\u1FFF]/.test(s);
    if (hasGreek && lang === 'el-GR' && !this.hasGreekVoice()) {
      s = this.romanizeGreek(s);
      lang = 'en-US';
    }
    return { text: s, lang, speak: this.shouldSpeak(s) };
  },

  async synthHeaders() {
    if (window.Auth?.authHeaders) return Auth.authHeaders();
    return { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
  },

  releaseAudio() {
    if (this._audio) { try { this._audio.pause(); this._audio.currentTime = 0; } catch (_) {} this._audio = null; }
    if (this._blobUrl) { try { URL.revokeObjectURL(this._blobUrl); } catch (_) {} this._blobUrl = null; }
  },

  playBlob(blob, gen) {
    return new Promise(resolve => {
      if (this.stopped || gen !== this._gen) { resolve(); return; }
      this.releaseAudio();
      this._blobUrl = URL.createObjectURL(blob);
      this._audio = new Audio(this._blobUrl);
      this._audio.onended = () => { this.releaseAudio(); resolve(); };
      this._audio.onerror = () => { this.releaseAudio(); resolve(); };
      this.speaking = true;
      AstranovLogo?.hookAiAudio?.(this._audio);
      window.syncHandsFreeBtn?.();
      this._audio.play().catch(() => resolve());
    });
  },

  async synthServer(text, lang) {
    try {
      const r = await fetch(SB_URL + '/functions/v1/voice', {
        method: 'POST',
        headers: await this.synthHeaders(),
        body: JSON.stringify({ text, lang, persona: this.persona.name })
      });
      if (r.ok && (r.headers.get('content-type') || '').includes('audio')) {
        this.engine = r.headers.get('X-Astranov-Voice') || 'astranov';
        return await r.blob();
      }
    } catch (_) {}
    return null;
  },

  speakBrowser(text, lang, gen) {
    return new Promise(resolve => {
      if (this.stopped || gen !== this._gen) { resolve(); return; }
      try { speechSynthesis.cancel(); } catch (_) {}
      let say = text;
      let sayLang = lang;
      if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(say) && !this.hasGreekVoice()) {
        say = this.romanizeGreek(say);
        sayLang = 'en-US';
      }
      const utter = new SpeechSynthesisUtterance(say);
      utter.lang = sayLang;
      utter.rate = 0.88;
      utter.pitch = 0.94;
      const voice = this.pickFemaleCalm(sayLang);
      if (voice) utter.voice = voice;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      this.engine = 'browser-female';
      this.speaking = true;
      speechSynthesis.speak(utter);
    });
  },

  humanize(text) {
    let s = ArcangeloDialect?.repairBrands?.(String(text || '')) || String(text || '');
    return s
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/[{}[\]"`#*_~|<>@$]/g, ' ')
      .replace(/\b([A-Z]{2,})\b/g, (_, w) => w.toLowerCase())
      .replace(/(\d)[.,](\d)/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  },

  shouldSpeak(text) {
    const t = (text || '').trim();
    const minLen = window._handsFreeVoice ? 2 : 4;
    if (t.length < minLen) return false;
    if (/^[\d\s.,:;+\-/]+$/.test(t)) return false;
    if (t.startsWith('{') || t.startsWith('[') || /^\s*"ok"/.test(t)) return false;
    if ((t.match(/[a-zA-Z\u0370-\u03FF]/g) || []).length < 3) return false;
    return true;
  },

  stop() {
    this._gen++;
    this.stopped = true;
    this.speaking = false;
    this.releaseAudio();
    try { speechSynthesis.cancel(); } catch (_) {}
  },

  flush() {
    this.stop();
    this._queue = Promise.resolve();
  },

  maySpeak() {
    return (voiceEnabled && voiceSessionActive && !this.stopped)
      || (window._handsFreeVoice && voiceEnabled && !this.stopped);
  },

  enqueue(text, onEnd, forceBrowser) {
    this._queue = this._queue
      .then(() => this._speakOne(text, onEnd, forceBrowser))
      .catch(() => {});
    return this._queue;
  },

  async _speakOne(text, onEnd, forceBrowser) {
    if (!voiceEnabled && !window._handsFreeVoice) { if (onEnd) onEnd(); return; }

    const gen = ++this._gen;
    this.stopped = false;
    this.speaking = true;
    AstranovLogo?.setAiActive?.(true);
    window.syncHandsFreeBtn?.();
    window.pauseVoiceRecognition?.();
    this.releaseAudio();
    try { speechSynthesis.cancel(); } catch (_) {}

    await this.ensureVoices();
    if (gen !== this._gen) { if (onEnd) onEnd(); return; }

    const prep = this.prepareForSpeech(text);
    if (!prep.speak) {
      if (gen === this._gen) {
        this.speaking = false;
        window.syncHandsFreeBtn?.();
      }
      if (onEnd) onEnd();
      return;
    }

    const { text: clean, lang } = prep;

    if (forceBrowser) {
      await this.speakBrowser(clean, lang, gen);
    } else {
      const blob = await this.synthServer(clean, lang);
      if (gen !== this._gen) { if (onEnd) onEnd(); return; }
      if (blob) {
        await this.playBlob(blob, gen);
      } else {
        await this.speakBrowser(clean, lang, gen);
      }
    }

    if (gen === this._gen) {
      this.speaking = false;
      AstranovLogo?.setAiActive?.(false);
      window.syncHandsFreeBtn?.();
      if (!onEnd) window.resumeVoiceRecognition?.();
    }
    if (onEnd && gen === this._gen && !this.stopped) onEnd();
  }
};

function speak(text, onEnd, force) {
  const handsFree = !!window._handsFreeVoice;
  if (!force && !handsFree && !Voice.maySpeak()) { if (onEnd) onEnd(); return Promise.resolve(); }
  if (handsFree && !voiceEnabled) voiceEnabled = true;
  const repaired = ArcangeloDialect?.repairOutbound?.(text, 'reply') ?? text;
  return Voice.enqueue(repaired, onEnd, !!force);
}
function stopSpeaking() { Voice.flush(); }

var MapDepict = {
  overlays: [],
  current: '',

  userPos() {
    return window._lastPos || { lat: 36.22, lng: 28.12 };
  },

  setHud(label, detail) {
    const line = detail ? label + ' — ' + detail : label;
    if (CliRibbon?.isGlobeHint?.(line)) return;
    GlobeDeck?.setMapStatus(line);
  },

  cancelAll() {
    this.overlays.forEach(o => {
      if (o.mesh && o.mesh.parent) o.mesh.parent.remove(o.mesh);
      if (o.line && o.line.parent) o.line.parent.remove(o.line);
      if (o.group && o.group.parent) o.group.parent.remove(o.group);
    });
    this.overlays = [];
    this.current = '';
    GlobeDeck?.setPreview('');
  },

  pulse(lat, lng, color, label, duration = 9000) {
    if (window.GlobeEntity) {
      const e = GlobeEntity.registerTemp({
        type: 'place',
        lat, lng,
        title: label || 'Here',
        description: 'Active now · zoom closer',
        urgency: 2,
        color: color || 0x00ddff,
        expires: duration,
      });
      if (window.AIGraphics) {
        const p = latLngToPos(lat, lng, 1.04);
        AIGraphics.spawnEffect(new THREE.Vector3(p.x, p.y, p.z), color, 14, 36);
      }
      return { entity: e, born: Date.now(), duration, label };
    }
    const p = latLngToPos(lat, lng, 1.04);
    const pos = new THREE.Vector3(p.x, p.y, p.z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.018, 0.032, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    ring.position.copy(pos);
    ring.lookAt(0, 0, 0);
    globePivot.add(ring);
    if (window.AIGraphics) AIGraphics.spawnEffect(pos, color, 14, 36);
    const entry = { mesh: ring, born: Date.now(), duration, label };
    this.overlays.push(entry);
    return entry;
  },

  arc(fromLat, fromLng, toLat, toLng, color = 0x00ffaa, duration = 14000) {
    const a = latLngToPos(fromLat, fromLng, 1.03);
    const b = latLngToPos(toLat, toLng, 1.03);
    const va = new THREE.Vector3(a.x, a.y, a.z);
    const vb = new THREE.Vector3(b.x, b.y, b.z);
    const mid = va.clone().add(vb).multiplyScalar(0.5).normalize().multiplyScalar(1.1);
    const curve = new THREE.QuadraticBezierCurve3(va, mid, vb);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(28)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 })
    );
    globePivot.add(line);
    const entry = { line, born: Date.now(), duration };
    this.overlays.push(entry);
    return line;
  },

  action(type, opts = {}) {
    const u = this.userPos();
    const lat = opts.lat != null ? opts.lat : u.lat;
    const lng = opts.lng != null ? opts.lng : u.lng;
    const detail = (opts.detail || '').slice(0, 80);
    this.current = type;

    const palette = {
      think: 0x44ccff,
      evolve: 0xaa66ff,
      teach: 0x66ff99,
      order: 0xffaa44,
      vendor: 0xff8844,
      compare: 0x66ffcc,
      driver: 0x4488ff,
      pay: 0x88ff44,
      phone: 0x44ff88,
      vhf: 0xffdd44,
      news: 0xcc88ff,
      explore: 0x00aaff,
      video: 0x3d9eff,
      location: 0x3d9eff,
      mode: 0x88aaff,
      stop: 0xff4466,
      drive: 0x44aaff,
      batch: 0x6688ff
    };
    const color = palette[type] || 0x00ddff;
    const labels = {
      think: 'Σκέψη ACI',
      evolve: 'Εξέλιξη collective',
      teach: 'Μνήμη / neuron',
      order: 'Παραγγελία',
      vendor: 'Καταστήματα',
      compare: 'Σύγκριση τιμών',
      driver: 'Οδηγοί διανομής',
      pay: 'Πληρωμή Coins',
      phone: 'Τηλέφωνο',
      vhf: 'VHF ασύρματος',
      news: 'Ειδήσεις',
      explore: 'Εξερεύνηση',
      video: 'Video κλήση',
      location: 'Τοποθεσία',
      mode: 'Λειτουργία ACI',
      stop: 'Διακοπή',
      drive: 'Οδήγηση δρόμου',
      batch: 'Batch · δουλειά μαζί'
    };

    this.setHud(labels[type] || type, detail);
    this.pulse(lat, lng, color, labels[type]);

    if (type === 'order' && opts.vendorLat != null) {
      this.arc(opts.vendorLat, opts.vendorLng, lat, lng, color);
      const fp = latLngToPos(lat, lng, 1.04);
      focusOnGlobePoint(new THREE.Vector3(fp.x, fp.y, fp.z));
    }
    if (type === 'vendor' && opts.vendors) {
      GlobeEntity?.syncVendors?.(opts.vendors);
      const v0 = opts.vendors[0];
      if (v0 && typeof flyToPoint === 'function') {
        const fp = latLngToPos(v0.lat, v0.lng, 1.04);
        flyToPoint(new THREE.Vector3(fp.x, fp.y, fp.z), GlobeControl?.Z?.national || 1.82);
      }
    }
    if (type === 'news') {
      const nlat = opts.worldLat ?? opts.lat ?? this.userPos().lat;
      const nlng = opts.worldLng ?? opts.lng ?? this.userPos().lng;
      this.pulse(nlat, nlng, color, 'News', 10000);
      GlobeControl?.flyToLatLng?.(nlat, nlng, 'news', GlobeControl?.Z?.global);
    }
    if (type === 'batch') {
      GlobeControl?.flyToLatLng?.(lat, lng, 'batch');
    }
    if (type === 'evolve') {
      const u = this.userPos();
      this.pulse(u.lat, u.lng, color, 'neuron', 11000);
    }
    if (type === 'think') {
      const fp = latLngToPos(lat, lng, 1.04);
      focusOnGlobePoint(new THREE.Vector3(fp.x, fp.y, fp.z));
    }
    if (type === 'compare' && opts.matches) {
      GlobeEntity?.syncVendors?.(opts.matches.map(m => m.vendor).filter(Boolean));
      opts.matches.slice(0, 6).forEach((m, i) => {
        const col = i === 0 ? 0x00ff88 : 0xffaa44;
        const v = m.vendor || m;
        this.arc(v.lat, v.lng, lat, lng, col);
      });
    }
    if (type === 'driver' && opts.drivers) {
      GlobeEntity?.syncDrivers?.(opts.drivers);
    }
    if (type === 'pay' && opts.vendorLat != null) {
      this.arc(opts.vendorLat, opts.vendorLng, lat, lng, 0x88ff44);
    }

    if (window.FieldBrain?.pulse) {
      FieldBrain?.pulse?.(type, detail || labels[type] || type, { role: opts.role });
    }
    return { type, lat, lng };
  },

  zoomToUser(zoom) {
    const u = this.userPos();
    this.action('location', { lat: u.lat, lng: u.lng, detail: 'εσύ · αναζήτηση' });
    const cityZ = GlobeControl?.Z?.city || 1.38;
    const z = zoom != null && zoom <= cityZ ? zoom : (GlobeControl?.Z?.national || 1.82);
    if (ZoomTiers && zoom == null) ZoomTiers.goTo('national', true);
    const fp = latLngToPos(u.lat, u.lng, 1.04);
    if (typeof flyToPoint === 'function') flyToPoint(new THREE.Vector3(fp.x, fp.y, fp.z), z);
    else focusOnGlobePoint(new THREE.Vector3(fp.x, fp.y, fp.z), z);
    return u;
  },

  scanCity(opts = {}) {
    const u = opts.userLat != null ? { lat: opts.userLat, lng: opts.userLng } : this.userPos();
    const vendors = opts.vendors || window.Commerce?.vendors || [];
    const label = opts.label || 'Looking around the city…';
    this.cancelAll();
    this.setHud('City scan', label);
    this.zoomToUser(opts.zoom || GlobeControl?.Z?.city || 1.32);
    CityMap?.onCamera?.(opts.zoom || 1.28, 'earth');
    const rings = [0, 1, 2, 3];
    rings.forEach((i) => {
      setTimeout(() => {
        const jitter = i * 0.0018;
        this.pulse(u.lat + jitter, u.lng - jitter, 0x3d9eff, label, 4200 + i * 800);
        if (vendors[i]) {
          const v = vendors[i];
          this.pulse(v.lat, v.lng, 0xff8844, v.name, 9000);
          this.arc(v.lat, v.lng, u.lat, u.lng, 0x66ffcc, 11000);
        }
      }, i * 420);
    });
    if (vendors.length) {
      GlobeEntity?.syncVendors?.(vendors);
      this.action('vendor', { lat: u.lat, lng: u.lng, detail: vendors.length + ' shops', vendors });
    }
    return u;
  },

  showOrderSearch(opts = {}) {
    const u = opts.userLat != null ? { lat: opts.userLat, lng: opts.userLng } : this.userPos();
    const wanted = (opts.wantedLabels || []).join(' · ');
    this.scanCity({
      userLat: u.lat, userLng: u.lng,
      vendors: (opts.matches || []).map(m => m.vendor).filter(Boolean).slice(0, 8),
      label: wanted || 'Order search',
      zoom: opts.zoom || GlobeControl?.Z?.city || 1.32,
    });
    if (opts.matches?.length) {
      this.action('compare', { lat: u.lat, lng: u.lng, detail: wanted, matches: opts.matches });
    }
    if (opts.drivers?.length) {
      this.action('driver', { lat: u.lat, lng: u.lng, detail: opts.drivers.length + ' drivers', drivers: opts.drivers });
    }
    return u;
  },

  tick() {
    const now = Date.now();
    this.overlays = this.overlays.filter(o => {
      const age = (now - o.born) / o.duration;
      if (age >= 1) {
        if (o.mesh && o.mesh.parent) o.mesh.parent.remove(o.mesh);
        if (o.line && o.line.parent) o.line.parent.remove(o.line);
        return false;
      }
      if (o.mesh) {
        o.mesh.material.opacity = 0.9 * (1 - age * 0.85);
        const s = 1 + age * 1.8;
        o.mesh.scale.set(s, s, s);
      }
      if (o.line) o.line.material.opacity = 0.75 * (1 - age);
      return true;
    });
  }
};

window.Voice = Voice;
window.MapDepict = MapDepict;

function userIntervene() {
  if (window.voiceInterrupt) window.voiceInterrupt({ keepHandsFree: false });
  else Voice.flush();
  voiceSessionActive = false;
  voiceEnabled = false;
  if (window.setVoicePerfMode) window.setVoicePerfMode(false);
  if (window.stopHandsFree) window.stopHandsFree();
  SessionHold?.release?.();
  GlobeVideo?.stop?.();
  GlobeVideo?.hide?.();
  SuperSpace?.stop?.();
  window.SuperAdd?.stop?.();
  GlobeEntity?.clearSelection?.();
  document.getElementById('aci-cli-in')?.classList.remove('voice-live');
  document.getElementById('aci-handsfree')?.classList.remove('listening', 'deck-btn-active', 'speaking');
  const cliIn = document.getElementById('aci-cli-in');
  if (cliIn) cliIn.placeholder = 'type or tap 🎧 · Enter or ➡';
  GlobeControl?.userTookGlobe?.('stop');
  if (window.PmrRadio) PmrRadio.hide();
    if (window.DrivingView) window.DrivingView.deactivate();
  MapDepict.cancelAll();
  if (window._aciAbort) { try { window._aciAbort.abort(); } catch (_) {} }
  if (window._droneAnim) { clearInterval(window._droneAnim); window._droneAnim = null; }
  if (window.Comms) window.Comms.vhfActive = false;
  if (recognition) { try { recognition.stop(); } catch (_) {} }
  isListening = false;
  if (ACI) ACI.evolving = false;
  GlobeDeck?.setMapStatus((AstroGlyphs?.stop || '🛑') + ' Stopped — globe is yours');
  if (window.ACIControl) ACIControl.reply('Stopped — globe is yours.');
}

window.userIntervene = userIntervene;
