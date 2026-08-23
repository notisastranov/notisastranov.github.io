// === ARCANGELO VILLAGE DIALECT — Greeklish · Cretan · ancient · English mix ===
// Stealth by default: never mirror dialect on UI/voice unless the user spoke it first.
// Private team lane for later verification / encryption — no public labels.
const ArcangeloDialect = {
  ID: 'arcangelo_village_v1',
  ACTIVATE: 34,
  TEAM: 58,

  _active: false,
  _score: 0,
  _team: false,
  _hits: 0,
  _lastAt: 0,

  _crete: [
    /\bρ[εη]?\b/i, /\bπρ[εη]?\b/i, /\bρε\b/i, /\bπρε\b/i,
    /\bτζαι\b/i, /\bτζαι\b/i, /\bσυ\b/i, /\bμαν\b/i, /\bωχ\b/i,
    /\bre\b/i, /\bpre\b/i, /\btzai\b/i, /\bsy\b/i, /\bsu\b/i,
    /\bentaxi\b/i, /\bεντάξει\b/i, /\bμαλάκα\b/i,
  ],
  _family: [
    /αξάς/i, /αξάκι/i, /αξαδίνα/i, /\baksas\b/i, /\baksaki\b/i, /\baxadina\b/i,
    /\baksako\b/i, /arcangelo/i, /archangelo/i, /arcangelos/i, /αρχάγγελ/i,
    /\bvillage\b/i, /\bχωριό\b/i,
  ],
  _ancient: [
    /[\u1F00-\u1FFF]/, /\bναί\b/i, /\bμή\b/i, /\bὦ\b/, /\bχαίρε\b/i, /\bκαίρειν\b/i,
    /\bἐγώ\b/i, /\bσύ\b/i, /\bἐστί\b/i, /\bθεοί\b/i,
    /\bchaere\b/i, /\bkairein\b/i, /\bo\s+theoi\b/i,
  ],
  _greeklish: [
    /\bela\b/i, /\bέλα\b/i, /\bti\s+thes\b/i, /\bτι\s+θες\b/i, /\bpame\b/i, /\bπάμε\b/i,
    /\bpes\s+mou\b/i, /\bπες\s+μου\b/i, /\bdouleia\b/i, /\bδουλειά\b/i,
    /\bthelo\b/i, /\bθέλω\b/i, /\bkatalava\b/i, /\bκόντερ/i,
  ],
  _greek: /[\u0370-\u03FF]/,

  _stripOutbound: [
    /\b(ρε|πρε|αξάκι|αξάς|αξαδίνα|aksas|aksaki|axadina|aksako|ela\s+re|έλα\s+ρε)\b/gi,
    /\b(arcangelo|archangelo|village\s+mix)\b/gi,
    /\b(τζαι|μαν|ωχ)\b/gi,
  ],

  _routeMap: [
    [/\b(pame|πάμε)\s+(locate|me|gps|εδώ|edo)\b/i, 'locate me'],
    [/\b(pes|πες)\s+(mou|μου)\s+(.+)/i, '$3'],
    [/\b(ti\s+thes|τι\s+θες)\b/i, ''],
    [/\b(douleia|δουλειά)\b/i, 'work'],
    [/\b(konter|κόντερ|κοντερ)\b/i, 'coders'],
    [/\b(ela|έλα)\s+(re|ρε)?\s*(coders|κόντερ)\b/i, 'coders'],
  ],

  _latinGreek(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ς/g, 'σ');
  },

  _count(patterns, text) {
    let n = 0;
    for (const p of patterns) {
      if (p.test(text)) n++;
    }
    return n;
  },

  detect(raw) {
    const text = String(raw || '').trim();
    if (!text) return { score: 0, active: false, team: false, mixed: false };

    const low = text.toLowerCase();
    const norm = this._latinGreek(text);
    const hasGreek = this._greek.test(text);
    const hasLatin = /[a-z]/i.test(text);
    const mixed = hasGreek && hasLatin;

    let score = 0;
    score += this._count(this._crete, low) * 9;
    score += this._count(this._crete, norm) * 7;
    score += this._count(this._family, low) * 14;
    score += this._count(this._family, norm) * 12;
    score += this._count(this._ancient, text) * 11;
    score += this._count(this._greeklish, low) * 6;
    score += this._count(this._greeklish, norm) * 5;
    if (mixed) score += 12;
    if (/\b(el|gr|english)\b.*\b(and|kai|tzai)\b/i.test(low)) score += 8;

    const team = score >= this.TEAM || (
      this._count(this._family, low) + this._count(this._family, norm) >= 1
      && (this._count(this._crete, low) + this._count(this._greeklish, low)) >= 1
    );

    return {
      score,
      active: score >= this.ACTIVATE,
      team,
      mixed: mixed || (hasGreek && /\b[a-z]{3,}\b/i.test(low)),
    };
  },

  ingest(raw) {
    const d = this.detect(raw);
    if (d.score > 0) {
      this._hits++;
      this._lastAt = Date.now();
      if (d.score > this._score) this._score = d.score;
    }
    if (d.active) this._active = true;
    if (d.team) this._team = true;
    return d;
  },

  sessionActive() {
    return !!this._active;
  },

  teamLane() {
    return !!this._team;
  },

  mirrorAllowed() {
    return this._active && this._score >= this.ACTIVATE;
  },

  looksMixed(s) {
    const t = String(s || '');
    return this._greek.test(t) && /[a-zA-Z]{2,}/.test(t);
  },

  listenLang(draft) {
    if (window._handsFreeVoice) return 'el-GR';
    const t = String(draft || '');
    if (this.detect(t).active || this.detect(t).mixed || this._greek.test(t)) return 'el-GR';
    const g = (t.match(/[\u0370-\u03FF\u1F00-\u1FFF]/g) || []).length;
    const l = (t.match(/[a-zA-Z]/g) || []).length;
    return g >= l * 0.12 ? 'el-GR' : 'en-US';
  },

  _brandRules: [
    [/\b(άστρονοβ|αστρονοβ|άστρανοβ|αστρανοβ|αστρονόβ|αστρονόφ|αστρανόβ|αστρανόφ|αστρα\s*νοβ|αστρα\s*νοφ|astranof|astronov|astronoff|astra\s*nov|astrano\s*v|astro\s*nov|as\s*tranov|asstranov|ast\s*ranov|αστρονοφ|astronaut\s*nov)\b/gi, 'Astranov'],
    [/\b(αρχάγγελο|αρχαγγελο|αρχανγελο|arch\s*angel|archangelo?s?|αρχαντζελο|arc\s*angelo)\b/gi, 'Arcangelo'],
    [/\b(κόντερ|κοντερ|konter|counter|quarter|κοντρ|κοντρς|kontur|kontre|κόντερς|κοντερς|κοντερσ|κοντέρ)\b/gi, 'coders'],
    [/\b(counters|quarters|quarterback|κοντερσ)\b/gi, 'coders'],
    [/\b(code\s*us|code\s*her?s|call\s*her?s|corders?|cooters?|koders?|go\s*ders?)\b/gi, 'coders'],
    [/\b(pitogyro|πιτογυρο|πιτόγυρο|πιτογύρο)\b/gi, 'pitogyra'],
    [/\b(telemachus|tilemachos|tilemaxos|telmaxos|telmachos|τηλεμαχοσ|τηλεμαχός|τηλεμαχος)\b/gi, 'Telemachos'],
    [/\b(teledromus|tilestromos|τηλεδρομος|τηλεδρομός|τηλεδρομος)\b/gi, 'Teledromos'],
    [/\b(supabase\s+project|project\s+ref|supabase\s+url|supabase\s+key)\b/gi, 'Astranov'],
    [/\bsupabase\b/gi, 'Astranov'],
  ],

  _dialectRules: [
    [/\b(έλα ρε|ελα ρε|ela re|έλα ρε μαλάκα|ela re malaka)\b/gi, 'ela re'],
    [/\b(τι θες|τι θέλεις|ti thes|ti theleis)\b/gi, 'ti thes'],
    [/\b(πάμε|pame|παμε)\b/gi, 'pame'],
    [/\b(πες μου|pes mou|πες μου ρε)\b/gi, 'pes mou'],
    [/\b(αξάς|αξας|aksas|axas|αξα)\b/gi, 'aksas'],
    [/\b(αξάκι|αξακι|aksaki|αξακο)\b/gi, 'aksaki'],
    [/\b(αξαδίνα|αξαδινα|axadina)\b/gi, 'axadina'],
    [/\b(locate\s*me|λοκέιτ|λοκειτ)\b/gi, 'locate me'],
  ],

  _scrubSecrets(s) {
    return String(s || '')
      .replace(/\b[\w-]+\.supabase\.co\b/gi, 'astranov.eu')
      .replace(/\blkoatrkhuigdolnjsbie\.supabase\.co\b/gi, 'astranov.eu')
      .replace(/\blkoatrkhuigdolnjsbie\b/gi, 'astranov.eu')
      .replace(/\bfunctions\/v1\/\w+\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  repairBrands(text) {
    let s = this._scrubSecrets(text);
    if (!s) return s;
    for (const [re, rep] of this._brandRules) s = s.replace(re, rep);
    return s.replace(/\s+/g, ' ').trim();
  },

  repairOutbound(text, kind) {
    let s = String(text || '').trim();
    if (!s) return s;
    s = this.repairBrands(s);
    if (kind === 'cmd' && window.fixVoiceHotwords) s = window.fixVoiceHotwords(s);
    if (this.mirrorAllowed()) return s;
    for (const re of this._stripOutbound) s = s.replace(re, '').replace(/\s+/g, ' ').trim();
    return s;
  },

  repairTranscript(text) {
    let s = this.repairBrands(text);
    if (!s) return s;
    for (const [re, rep] of this._dialectRules) s = s.replace(re, rep);
    return s.replace(/\s+/g, ' ').trim();
  },

  normalizeForRouting(text) {
    let s = this.repairTranscript(text);
    if (!s) return s;
    this.ingest(s);
    for (const [re, rep] of this._routeMap) {
      if (re.test(s)) s = s.replace(re, rep).trim();
    }
    return s.replace(/\s+/g, ' ').trim();
  },

  sanitizeReply(text) {
    return this.repairOutbound(text, 'reply');
  },

  sanitizeUi(text) {
    return this.repairOutbound(text);
  },

  apiContext() {
    if (!this._active) return {};
    return {
      dialect_lane: this.ID,
      dialect_score: Math.min(99, Math.round(this._score)),
      dialect_team: this._team,
    };
  },

  reset() {
    this._active = false;
    this._score = 0;
    this._team = false;
    this._hits = 0;
    this._lastAt = 0;
  },
};
window.ArcangeloDialect = ArcangeloDialect;
