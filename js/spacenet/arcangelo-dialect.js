/**
 * Arcangelo / Archangelos village dialect — owner memory lane
 * Greeklish · Cretan village · ancient Greek · English mix
 *
 * Stealth by default: do not mirror village voice on UI unless the owner spoke it first.
 * This is part of ASTRANOV MIND (owner memory), not a disposable chatbot skill.
 * v3: richer route map · English-safe expand · simple task intents
 */
(function (global) {
  'use strict';

  var D = {
    ID: 'arcangelo_village_v3',
    ACTIVATE: 22,
    TEAM: 45,
    _active: false,
    _score: 0,
    _team: false,
    _hits: 0,
    _lastAt: 0,

    /** Rhodes · Archangelos village family / crew */
    _family: [
      /αξάς/i,
      /αξάκι/i,
      /αξαδίνα/i,
      /\baksas\b/i,
      /\baksaki\b/i,
      /\baxadina\b/i,
      /\baksako\b/i,
      /arcangelo/i,
      /archangelo/i,
      /arcangelos/i,
      /archangelos/i,
      /αρχάγγελ/i,
      /αρχαγγελ/i,
      /\bvillage\b/i,
      /\bχωριό\b/i,
      /\bxorio\b/i,
    ],
    _crete: [
      /\bρε\b/i,
      /\bπρε\b/i,
      /\bre\b/i,
      /\bpre\b/i,
      /\bτζαι\b/i,
      /\btzai\b/i,
      /\bentaxi\b/i,
      /\bεντάξει\b/i,
      /\bμαν\b/i,
      /\bωχ\b/i,
    ],
    _ancient: [
      /[\u1F00-\u1FFF]/,
      /\bχαίρε\b/i,
      /\bκαίρειν\b/i,
      /\bchaere\b/i,
      /\bchaire\b/i,
      /\bkairein\b/i,
      /\bὦ\b/,
      /\bθεοί\b/i,
      /\bo\s+theoi\b/i,
    ],
    _greeklish: [
      /\bela\b/i,
      /\bέλα\b/i,
      /\bti\s+thes\b/i,
      /\bτι\s+θες\b/i,
      /\bpame\b/i,
      /\bπάμε\b/i,
      /\bpes\s+mou\b/i,
      /\bπες\s+μου\b/i,
      /\bdouleia\b/i,
      /\bδουλειά\b/i,
      /\bthelo\b/i,
      /\bthelw\b/i,
      /\bθέλω\b/i,
      /\bkatalava\b/i,
      /\bkala\b/i,
      /\boraia\b/i,
      /\byia\b/i,
      /\bkalimera\b/i,
      /\bkalispera\b/i,
      /\befharisto\b/i,
    ],
    _greek: /[\u0370-\u03FF\u1F00-\u1FFF]/,

    /**
     * Owner tray / village order lexicon (Greeklish + Greek)
     */
    LEXICON: {
      aksaki: {
        means: 'family/crew address — little brother / mate from Archangelos village',
        el: 'αξάκι',
        reply: 'Ναι αξάκι — εδώ είμαι. English or Greek — πες τι θες.',
      },
      aksas: {
        means: 'family/crew address — brother / mate',
        el: 'αξάς',
        reply: 'Άκουσα αξά. Τι κάνουμε;',
      },
      axadina: {
        means: 'family female address',
        el: 'αξαδίνα',
        reply: 'Εδώ είμαι. Πες μου.',
      },
      pitogyra: {
        means: 'pita gyro / pitogyro food order (village tray)',
        el: 'πιτογύρα / πιτόγυρο',
        food: 'pitogyra',
        reply: 'Πιτογύρα — κατάλαβα. Παραγγελία στο map με courier / Telemachos.',
      },
      mpyronia: {
        means: 'beers (μπυρόνια) — Greeklish mpyronia / mpironia / mpyres',
        el: 'μπυρόνια',
        food: 'beer',
        reply: 'Μπυρόνια στο tray — μαζί με πιτογύρα αν θες.',
      },
      tsigareta: {
        means: 'cigarettes',
        el: 'τσιγάρα',
        food: 'cigarettes',
        reply: 'Τσιγάρα σημειωμένα στο order.',
      },
      archangelos: {
        means: 'Archangelos village Rhodes — owner home dialect / mission root',
        el: 'Αρχάγγελος Ρόδου',
        lat: 36.215,
        lng: 28.125,
        reply: 'Αρχάγγελος — το χωριό. Globe / map εκεί αν θες.',
      },
      telemachos: {
        means: 'ΤΗΛΕΜΑΧΟΣ — Astranov drone pilot (gaming + delivery stack)',
        el: 'Τηλέμαχος',
        reply: 'Telemachos (Τηλέμαχος) online — drone pilot. Πες deliver / pitogyra / pilot home.',
      },
      tilemaxos: {
        means: 'tilemaxos — extreme Telemachos edition spelling',
        el: 'tilemaxos',
        reply: 'Tilemaxos = Telemachos extreme stack. Drone pilot ready.',
      },
      teledromos: {
        means: 'ΤΗΛΕΔΡΟΜΟΣ — commercial drone delivery edition',
        el: 'Τηλέδρομος',
        reply: 'Teledromos — commercial delivery drone lane.',
      },
    },

    _stripOutbound: [
      /\b(ρε|πρε|αξάκι|αξάς|αξαδίνα|aksas|aksaki|axadina|aksako|ela\s+re|έλα\s+ρε)\b/gi,
      /\b(arcangelo|archangelo|village\s+mix)\b/gi,
    ],

    // Greeklish / Greek → English routing for AI + CLI act paths
    _routeMap: [
      [/\b(pame|πάμε|παμε)\s+(locate|me|gps|εδώ|edo|here)\b/i, 'locate me'],
      [/\b(pame|πάμε)\s+(home|σπιτι|σπίτι)\b/i, 'pilot home'],
      [/\b(pes|πες)\s+(mou|μου)\s+(.+)/i, '$3'],
      [/\b(ti\s+thes|τι\s+θες|τι\s+θέλεις)\b/i, 'help'],
      [/\b(douleia|δουλειά|δουλεια)\b/i, 'work'],
      [/\b(thelo|thelw|θέλω|θελω)\s+(pitogyra|πιτογυρ|πιτογύρ)/i, 'order pitogyra'],
      [/\b(thelo|thelw|θέλω|θελω)\s+(mpyronia|mpironia|μπυρ|beer)/i, 'order beer'],
      [/\b(thelo|thelw|θέλω|θελω)\s+(pizza|πιτσα|πίτσα)\b/i, 'order me a pizza'],
      [/\b(thelo|thelw|θέλω|θελω)\s+(locate|gps|pin)\b/i, 'locate me'],
      [/\b(που\s+ειμαι|πού\s+είμαι|pou\s+eimai|vres\s+me|βρες\s+με)\b/i, 'locate me'],
      [/\b(σκοτειν(ό|ο)?\s*map|dark\s*χαρτη|night\s*map)\b/i, 'dark map'],
      [/\b(φωτειν(ό|ο)?\s*map|bright\s*map)\b/i, 'bright map'],
      [/\b(παραγγειλε|παράγγειλε|paraggeile)\s+(πιτσα|πίτσα|pizza)\b/i, 'order me a pizza'],
      [/\b(παραγγειλε|παράγγειλε)\s+(πιτογυρ)/i, 'order pitogyra'],
      [/\bela\s+re\b/i, ''],
      [/\b(aksaki|αξάκι)\b/i, ''],
      [/\b(καλημερα|καλημέρα|kalimera)\b/i, 'good morning'],
      [/\b(καλησπερα|καλησπέρα|kalispera)\b/i, 'good evening'],
      [/\b(ευχαριστω|ευχαριστώ|efharisto)\b/i, 'thanks'],
      [/\b(βοηθεια|βοήθεια|voitheia)\b/i, 'help'],
      [/\b(μαγαζια|μαγαζιά|magazia)\b/i, 'shops'],
      [/\b(anoi(k)?se|anoixe|άνοιξε|ανοιξε)\s+(youtube|yt|video)\b/i, 'youtube'],
      [/\b(thelo|thelw)\s+(youtube|yt|video)\b/i, 'youtube'],
      [/\b(des\s+video|show\s+video|watch\s+video)\b/i, 'youtube'],
      [/^\s*(youtube|yt)\s*$/i, 'youtube'],

      [/^\s*(πιτσα|πίτσα|pitza|pitsa)\s*[!.?]*$/i, 'order me a pizza'],
      [/^\s*(πιτογυρα|πιτογύρα|pitogyra)\s*[!.?]*$/i, 'order pitogyra'],
      [/\b(thelo|thelw|θέλω|θελω)\s+(fagito|φαγητό|φαγητο|food)\b/i, 'order food'],
      [/\b(thelo|thelw|θέλω|θελω)\s+(kafes|kafe|καφέ|καφε)\b/i, 'order coffee'],
      [/\b(thelo|thelw|θέλω|θελω)\s+(souvlaki|σουβλάκι)\b/i, 'order souvlaki'],
      [/\b(fere|φέρε|φερε)\s+(pizza|πιτσα|πίτσα)\b/i, 'order me a pizza'],
      [/\b(fere|φέρε)\s+(pitogyra|πιτογυρ)\b/i, 'order pitogyra'],
      [/\b(kane|κάνε|κανε)\s+(paraggelia|παραγγελία|order)\b/i, 'order'],
      [/\b(pou\s*eimai|πού\s*είμαι|pou\s*ime)\b/i, 'locate me'],
      [/\b(vres\s*me|βρες\s*με)\b/i, 'locate me'],
      [/\b(magazia|μαγαζιά|μαγαζια)\b/i, 'shops'],
      [/\b(odigos|οδηγός|οδηγος)\b/i, 'drive on'],
      [/\b(paradosi|παράδοση)\b/i, 'deliver me'],
      [/\b(akyrose|ακύρωσε|ακυρωσε)\b/i, 'cancel'],
      [/\b(pame\s+spiti|πάμε\s+σπίτι|πάμε\s+σπιτι)\b/i, 'pilot home'],
      [/\b(peinao|πεινάω|πειναω)\b/i, 'order food'],
      [/\b(ntouleia|douleia|δουλειά)\b/i, 'work'],
      [/\b(grigora\s+pizza|γρήγορα\s+πιτσα)\b/i, 'order me a pizza'],
      // Cretan / village
      [/\b(kame|κάμε)\s+(mia\s+)?(pizza|πιτσα)\b/i, 'order me a pizza'],
      [/\b(pre|πρε)\b/i, ''],
      [/\b(ente|έντε|nte)\b/i, ''],
    ],

    _brandRules: [
      [
        /\b(άστρονοβ|αστρονοβ|άστρανοβ|αστρανοβ|astranof|astronov|astronoff|asstranov)\b/gi,
        'Astranov',
      ],
      [
        /\b(αρχάγγελο|αρχαγγελο|αρχανγελο|arch\s*angel|archangelo?s?|arc\s*angelo|archangelos)\b/gi,
        'Archangelos',
      ],
      [/\b(pitogyro|πιτογυρο|πιτόγυρο|πιτογύρο|πιτογύρα|pitogyra)\b/gi, 'pitogyra'],
      [
        /\b(mpyronia|mpironia|mpyres|mpires|μπυρόνια|μπυρονια|μπίρες|μπιρες|beers?)\b/gi,
        'mpyronia',
      ],
      [/\b(tsigareta|tsigara|τσιγάρα|τσιγαρα|cigarettes?)\b/gi, 'tsigareta'],
      [
        /\b(telemachus|tilemachos|tilemaxos|telmaxos|telmachos|τηλεμαχοσ|τηλεμαχός|τηλεμαχος|τηλέμαχος)\b/gi,
        'Telemachos',
      ],
      [/\b(teledromus|teledromos|τηλεδρομος|τηλεδρομός)\b/gi, 'Teledromos'],
      [/\b(αξάκι|αξακι|aksaki)\b/gi, 'aksaki'],
      [/\b(αξάς|αξας|aksas)\b/gi, 'aksas'],
    ],

    _dialectRules: [
      [/\b(έλα ρε|ελα ρε|ela re)\b/gi, 'ela re'],
      [/\b(τι θες|τι θέλεις|ti thes|ti theleis)\b/gi, 'ti thes'],
      [/\b(πάμε|pame|παμε)\b/gi, 'pame'],
      [/\b(πες μου|pes mou)\b/gi, 'pes mou'],
      [/\b(αξάς|αξας|aksas)\b/gi, 'aksas'],
      [/\b(αξάκι|αξακι|aksaki)\b/gi, 'aksaki'],
      [/\b(αξαδίνα|αξαδινα|axadina)\b/gi, 'axadina'],
      [/\b(locate\s*me|λοκέιτ|λοκειτ)\b/gi, 'locate me'],
      [/\b(thelo|thelw|θελω|θέλω)\b/gi, 'thelo'],
    ],

    _latinGreek: function (s) {
      return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ς/g, 'σ');
    },

    _count: function (patterns, text) {
      var n = 0;
      var i;
      for (i = 0; i < patterns.length; i++) {
        if (patterns[i].test(text)) n++;
      }
      return n;
    },

    detect: function (raw) {
      var text = String(raw || '').trim();
      if (!text) return { score: 0, active: false, team: false, mixed: false };
      var low = text.toLowerCase();
      var norm = this._latinGreek(text);
      var hasGreek = this._greek.test(text);
      var hasLatin = /[a-z]/i.test(text);
      var mixed = hasGreek && hasLatin;
      var score = 0;
      score += this._count(this._crete, low) * 9;
      score += this._count(this._family, low) * 14;
      score += this._count(this._family, norm) * 12;
      score += this._count(this._ancient, text) * 11;
      score += this._count(this._greeklish, low) * 6;
      if (mixed) score += 12;
      if (/\b(aksaki|aksas|pitogyra|mpyronia|mpironia|tsigareta|telemachos|tilemaxos|thelo|pame)\b/i.test(low))
        score += 20;
      if (/αξάκι|πιτογύρ|μπυρόν|τηλεμαχ|αρχάγγελ|θέλω|πάμε/i.test(text)) score += 20;
      var team =
        score >= this.TEAM ||
        (this._count(this._family, low) + this._count(this._family, norm) >= 1 &&
          this._count(this._crete, low) + this._count(this._greeklish, low) >= 1);
      return {
        score: score,
        active: score >= this.ACTIVATE,
        team: team,
        mixed: mixed || (hasGreek && /\b[a-z]{3,}\b/i.test(low)),
      };
    },

    ingest: function (raw) {
      var d = this.detect(raw);
      if (d.score > 0) {
        this._hits++;
        this._lastAt = Date.now();
        if (d.score > this._score) this._score = d.score;
      }
      if (d.active) this._active = true;
      if (d.team) this._team = true;
      return d;
    },

    sessionActive: function () {
      return !!this._active;
    },
    teamLane: function () {
      return !!this._team;
    },
    mirrorAllowed: function () {
      return this._active && this._score >= this.ACTIVATE;
    },

    looksMixed: function (s) {
      var t = String(s || '');
      return this._greek.test(t) && /[a-zA-Z]{2,}/.test(t);
    },

    listenLang: function (draft) {
      var t = String(draft || '');
      if (this.detect(t).active || this.detect(t).mixed || this._greek.test(t)) return 'el-GR';
      return 'en-US';
    },

    repairBrands: function (text) {
      var s = String(text || '');
      var i;
      for (i = 0; i < this._brandRules.length; i++) {
        s = s.replace(this._brandRules[i][0], this._brandRules[i][1]);
      }
      return s.replace(/\s+/g, ' ').trim();
    },

    repairTranscript: function (text) {
      var s = this.repairBrands(text);
      var i;
      for (i = 0; i < this._dialectRules.length; i++) {
        s = s.replace(this._dialectRules[i][0], this._dialectRules[i][1]);
      }
      return s.replace(/\s+/g, ' ').trim();
    },

    repairOutbound: function (text, kind) {
      var s = this.repairBrands(String(text || '').trim());
      if (!s) return s;
      if (this.mirrorAllowed()) return s;
      var i;
      for (i = 0; i < this._stripOutbound.length; i++) {
        s = s.replace(this._stripOutbound[i], '').replace(/\s+/g, ' ').trim();
      }
      return s;
    },

    normalizeForRouting: function (text) {
      var s = this.repairTranscript(text);
      if (!s) return s;
      this.ingest(s);
      // Full Greeklish / Greek phrase map first
      try {
        if (global.SNGreeklish && SNGreeklish.toEnglishCommand) {
          var eng = SNGreeklish.toEnglishCommand(s);
          if (eng && eng.length >= 2) s = eng;
        } else if (global.SNGreeklish && SNGreeklish.normalize) {
          s = SNGreeklish.normalize(s) || s;
        }
      } catch (_) {}
      var i;
      for (i = 0; i < this._routeMap.length; i++) {
        if (this._routeMap[i][0].test(s)) s = s.replace(this._routeMap[i][0], this._routeMap[i][1]).trim();
      }
      // second greeklish pass after route map
      try {
        if (global.SNGreeklish && SNGreeklish.toEnglishCommand) {
          var eng2 = SNGreeklish.toEnglishCommand(s);
          if (eng2) s = eng2;
        }
      } catch (_) {}
      return s.replace(/\s+/g, ' ').trim();
    },

    /** Expand owner lexicon hits into food/order/pilot/task intents for Astranov Mind */
    expandIntent: function (text) {
      var raw = String(text || '');
      var s = this.normalizeForRouting(raw);
      var low = s.toLowerCase();
      var folded = this._latinGreek(raw + ' ' + s);
      var out = {
        text: s,
        dialect: this.detect(raw),
        food: null,
        foods: [],
        pilot: false,
        village: false,
        familyCall: false,
        locate: false,
        replyHint: null,
      };
      if (/\b(aksaki|aksas|axadina|αξάκι|αξάς)\b/i.test(low + raw)) {
        out.familyCall = true;
        out.replyHint = this.LEXICON.aksaki.reply;
      }
      if (/\b(archangelos|arcangelo|αρχάγγελ)\b/i.test(low + raw)) {
        out.village = true;
        out.replyHint = this.LEXICON.archangelos.reply;
      }
      if (/\b(telemachos|tilemaxos|tilemachos|teledromos|τηλεμαχ|drone\s*pilot|pilot\s+home)\b/i.test(low + raw)) {
        out.pilot = true;
        out.replyHint = this.LEXICON.telemachos.reply;
      }
      if (/\b(locate|where am i|που ειμαι)\b/i.test(folded)) {
        out.locate = true;
      }
      if (/\b(pitogyra|pitogyro|πιτογυρ)\b/i.test(low + raw)) {
        out.food = 'pitogyra';
        out.foods.push('pitogyra');
      }
      if (/\b(mpyronia|mpironia|mpyres|μπυρόν|μπίρ|beer)\b/i.test(low + raw)) {
        out.foods.push('mpyronia');
        if (!out.food) out.food = 'beer';
      }
      if (/\b(tsigareta|tsigara|τσιγάρ|cigar)\b/i.test(low + raw)) {
        out.foods.push('tsigareta');
      }
      if (/\b(pizza|πιτσα|πίτσα|pitza|pitsa)\b/i.test(low + raw)) {
        if (!out.food) out.food = 'pizza';
        if (out.foods.indexOf('pizza') < 0) out.foods.push('pizza');
      }
      if (/\b(coffee|καφέ|καφε|kafes)\b/i.test(low + raw)) {
        if (!out.food) out.food = 'coffee';
        if (out.foods.indexOf('coffee') < 0) out.foods.push('coffee');
      }
      if (/\b(souvlaki|σουβλάκι)\b/i.test(low + raw)) {
        if (!out.food) out.food = 'souvlaki';
        if (out.foods.indexOf('souvlaki') < 0) out.foods.push('souvlaki');
      }
      if (out.foods.length && !out.food) out.food = out.foods[0];
      return out;
    },

    explain: function (term) {
      var k = String(term || '')
        .toLowerCase()
        .trim();
      k = k.replace(/πιτογύρ.*/, 'pitogyra').replace(/μπυρ.*/, 'mpyronia').replace(/αξάκ.*/, 'aksaki');
      if (/\bpitogy/.test(k)) k = 'pitogyra';
      if (/\bmpyr|mpir|beer/.test(k)) k = 'mpyronia';
      if (/\baksak|αξάκ/.test(k)) k = 'aksaki';
      if (/\btelem|tilem|τηλεμ/.test(k)) k = 'telemachos';
      if (/\barchangel|arcangel|αρχάγ/.test(k)) k = 'archangelos';
      return this.LEXICON[k] || null;
    },

    apiContext: function () {
      if (!this._active) return {};
      return {
        dialect_lane: this.ID,
        dialect_score: Math.min(99, Math.round(this._score)),
        dialect_team: this._team,
        mind: 'astranov',
      };
    },

    reset: function () {
      this._active = false;
      this._score = 0;
      this._team = false;
      this._hits = 0;
      this._lastAt = 0;
    },
  };

  global.ArcangeloDialect = D;
  global.SNArcangelo = D;
})(typeof window !== 'undefined' ? window : globalThis);
