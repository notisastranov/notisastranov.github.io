(function(){
// === TELEMACHOS PILOT — gaming · commercial · extreme takeover ===
// ΤΗΛΕΜΑΧΟΣ (gaming) · ΤΗΛΕΔΡΟΜΟΣ (commercial) · tilemaxos (extreme tech / hostile takeover)
const Pilot = {
  HOME: { lat: 36.2, lng: 28.1 },
  EVO_KEY: 'astranov_telemachos_evolve_v1',

  EDITIONS: {
    telemachos: {
      id: 'telemachos',
      name_gr: 'ΤΗΛΕΜΑΧΟΣ',
      name_latin: 'telemachos',
      tier: 'gaming',
      tagline: 'Ο ισχυρότερος πιλότος drone — εξελίσσεται με πραγματικούς gamers στο Astranov.',
      takeover: true,
      evolve: true,
      color: 0x00ccff,
    },
    teledromos: {
      id: 'teledromos',
      name_gr: 'ΤΗΛΕΔΡΟΜΟΣ',
      name_latin: 'teledromos',
      tier: 'commercial',
      tagline: 'Εμπορική έκδοση — marketplace delivery, vendors, drivers, ασφαλείς διαδρομές.',
      takeover: false,
      evolve: false,
      color: 0x3d9eff,
    },
    tilemaxos: {
      id: 'tilemaxos',
      name_gr: 'tilemaxos',
      name_latin: 'tilemaxos',
      tier: 'extreme',
      parent: 'telemachos',
      tagline: 'Extreme stack — ανάληψη ΟΠΟΙΟΥΔΗΠΟΤΕ drone (ειδικά FPV) · RTB στον πιλότο του.',
      takeover: true,
      evolve: true,
      color: 0xff3366,
    },
  },

  EXTREME_TECH: [
    { id: 'mesh_hijack', label: 'Mesh C2 hijack', desc: 'Override opponent drone command mesh on globe field' },
    { id: 'rf_dominance', label: 'RF spectrum dominance', desc: 'Jam + seize control link in 2.4/5.8 GHz + PMR guard band' },
    { id: 'swarm_handoff', label: 'Swarm handoff', desc: 'Captured unit joins your fleet instantly — unlimited scale' },
    { id: 'metis_routing', label: 'Metis anti-counter', desc: 'Hellenic cunning — reroute when enemy tries to reclaim' },
    { id: 'multi_domain', label: 'Multi-domain relay', desc: 'Air ↔ ground ↔ sea ↔ underwater bridge for takeover probe' },
    { id: 'user_telemetry', label: 'Real-user telemetry fusion', desc: 'Power grows from live gamers on map — no simulation' },
    { id: 'ghost_echo', label: 'Ghost echo decoy', desc: 'Opponent sees false drone while you own the real unit' },
    { id: 'justice_gate', label: 'Justice gate', desc: 'Takeover only in gaming field — never on civilian marketplace routes' },
    { id: 'fpv_seize', label: 'FPV link seizure', desc: 'Hijack analog/digital FPV video+C2 — highest priority target class' },
    { id: 'pilot_rtb', label: 'Pilot RTB flyback', desc: 'After capture, fly drone home to its pilot on globe — handoff at feet' },
  ],

  TEAM_BLUE: 0x1a6fd4,
  TEAM_RED: 0xff2244,
  WIN_ITEM_IDS: ['pita', 'beer', 'cigarettes', 'burger'],

  _team: { red: [], pending: [], hits: [], won: false, fed: 0, redCount: 0 },

  DOMAINS: {
    fpv: { emoji: '🥽', label: 'FPV', color: 0xff66cc, alt: 1.07 },
    air: { emoji: '🛸', label: 'Air', color: 0x44ccff, alt: 1.06 },
    ground: { emoji: '🚙', label: 'Ground', color: 0xffaa33, alt: 1.025 },
    sea: { emoji: '🚤', label: 'Sea', color: 0x0088ff, alt: 1.02 },
    underwater: { emoji: '🤿', label: 'Underwater', color: 0x2266aa, alt: 1.015 },
  },

  SPELLINGS_TELEMACHOS: [
    'telemachos', 'telemachus', 'telemakhos', 'tilemaxos', 'tilemachos', 'tilemachus',
    'telemaxos', 'telmaxos', 'telmachos', 'tilemax', 'thilemaxos', 'thilemachos',
    'τηλεμαχος', 'τηλεμαχοσ', 'τηλεμαχός', 'τηλεμαχ',
  ],

  SPELLINGS_TELEDROMOS: [
    'teledromos', 'teledromus', 'teledromo', 'tilestromos', 'τηλεδρομος', 'τηλεδρομός', 'τηλεδρομ',
  ],

  _edition: 'telemachos',
  _fleet: { fpv: [], air: [], ground: [], sea: [], underwater: [] },
  _fieldDrones: [],
  _hostile: [],
  _captured: [],
  _activeMissions: [],
  _nextId: 1,
  _evolution: {
    xp: 0,
    level: 1,
    takeovers: 0,
    flybacks: 0,
    fpv_captures: 0,
    deliveries: 0,
    gamers_seen: 0,
    power: 100,
  },

  get edition() { return this.EDITIONS[this._edition] || this.EDITIONS.telemachos; },
  get NAME_GR() { return this.edition.name_gr; },
  get NAME_LATIN() { return this.edition.name_latin; },

  async init() {
    this._loadEvolutionLocal();
    this._initRealtime();
    this._initTeamRealtime();
    if (Auth?.whenReady) await Auth.whenReady();
    this._loadEvolutionFromServer();
    this._subscribeC2Signals();
    if (Auth?.user) this.refreshTeamStatus({ quiet: true });
  },

  async api(body) {
    if (Auth?.whenReady) await Auth.whenReady();
    const headers = Auth?.authHeaders ? await Auth.authHeaders() : sbHeaders();
    const fnBase = typeof resolveAstranovFunctionsUrl === 'function' ? resolveAstranovFunctionsUrl() : (SB_URL + '/functions/v1');
    const r = await fetch(fnBase + '/pilot-command', {
      method: 'POST', headers,
      body: JSON.stringify(body),
    });
    return r.json().catch(() => ({ error: 'network' }));
  },

  _loadEvolutionLocal() {
    try {
      const raw = localStorage.getItem(this.EVO_KEY);
      if (raw) Object.assign(this._evolution, JSON.parse(raw));
    } catch (_) {}
  },

  _saveEvolutionLocal() {
    try { localStorage.setItem(this.EVO_KEY, JSON.stringify(this._evolution)); } catch (_) {}
  },

  async _loadEvolutionFromServer() {
    if (!Auth?.user) return;
    const r = await this.api({ action: 'evolution_get' });
    if (r.ok && r.evolution) {
      Object.assign(this._evolution, r.evolution);
      this._saveEvolutionLocal();
    }
  },

  _applyEvolution(evo) {
    if (!evo) return;
    Object.assign(this._evolution, evo);
    this._saveEvolutionLocal();
  },

  _initRealtime() {
    if (!Auth?.client || this._rtChannel) return;
    this._rtChannel = Auth.client.channel('pilot-fleet-live');
    this._rtChannel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'pilot_drones',
    }, () => { this.scanAllDrones({ quiet: true }); });
    this._rtChannel.subscribe();
  },

  _subscribeC2Signals() {
    if (!Auth?.user?.id || !Auth?.client || this._c2Channel) return;
    const room = 'pilot-c2-' + Auth.user.id;
    this._c2Channel = Auth.client.channel('pilot-c2-' + Auth.user.id);
    this._c2Channel.on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'webrtc_signals',
      filter: 'room=eq.' + room,
    }, ({ new: sig }) => {
      if (!sig) return;
      if (sig.type === 'drone_seized') {
        ACIControl?.reply('C2 alert — your ' + (sig.payload?.domain || 'drone') + ' link seized · tilemaxos RTB incoming');
      }
      if (sig.type === 'drone_rtb') {
        ACIControl?.reply('C2 — drone returning to you on OSRM route');
      }
      if (sig.type === 'blue_victory') {
        this._declareVictory(sig.payload);
      }
    });
    this._c2Channel.subscribe();
  },

  _initTeamRealtime() {
    if (!Auth?.client || this._teamChannel) return;
    this._teamChannel = Auth.client.channel('pilot-team-hits');
    this._teamChannel.on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'pilot_team_hits',
    }, () => { this.refreshTeamStatus({ quiet: true }); });
    this._teamChannel.subscribe();
  },

  _blueAllyIds() {
    const ids = [];
    if (Auth?.user?.id) ids.push(Auth.user.id);
    (window.MapComms?.members ? [...window.MapComms.members.keys()] : []).forEach((id) => {
      if (id && id !== Auth?.user?.id) ids.push(id);
    });
    return ids;
  },

  async refreshTeamStatus(opts) {
    opts = opts || {};
    if (!Auth?.user) {
      const titans = WillaGames?.getDemoRedTeam?.() || [];
      if (titans.length) {
        this._team = {
          red: titans,
          pending: titans.map((p) => ({ id: p.id, name: p.name })),
          hits: [],
          won: false,
          fed: 0,
          redCount: titans.length,
        };
        this._visualizeTeams();
      } else {
        this._team = { red: [], pending: [], hits: [], won: false, fed: 0, redCount: 0 };
      }
      return this._team;
    }
    const r = await this.api({ action: 'team_status', blue_allies: this._blueAllyIds() });
    if (!r.ok) return this._team;
    this._team = {
      red: r.red || [],
      pending: r.pending || [],
      hits: r.hits || [],
      won: !!r.won,
      fed: r.fed_count || 0,
      redCount: r.red_count || 0,
    };
    this._visualizeTeams();
    if (r.won && !opts.quiet) this._declareVictory({ fed_count: r.fed_count, red_count: r.red_count });
    return this._team;
  },

  _findRedPlayer(q) {
    const list = this._team.red || [];
    const s = String(q || '').toLowerCase().trim();
    if (!s || s === 'all' || s === 'any') return list[0] || null;
    return list.find((p) => p.id === q || String(p.id).includes(s))
      || list.find((p) => (p.name || '').toLowerCase().includes(s))
      || null;
  },

  _resolveWinItemFromOrder(items) {
    const names = (items || []).map((i) => String(i.name || '')).join(' ');
    const wants = Commerce?.parseWantedItems?.(names) || [];
    return wants.find((w) => this.WIN_ITEM_IDS.includes(w.id)) || null;
  },

  _visualizeTeams() {
    const red = this._team.red || [];
    const pending = this._team.pending || [];
    const pendingIds = new Set(pending.map((p) => p.id));
    red.forEach((p) => {
      const fed = !pendingIds.has(p.id);
      MapDepict?.pulse?.(p.lat, p.lng, fed ? 0x884444 : this.TEAM_RED, (fed ? '✓ ' : '🔴 ') + p.name, 14000);
    });
    const enrichedRed = red.map((p) => ({
      ...p,
      team: 'red',
      emoji: pendingIds.has(p.id) ? '🔴' : '✓',
      fed: !pendingIds.has(p.id),
    }));
    const redIds = new Set(red.map((p) => p.id));
    const blues = (window.others || []).filter((u) => !redIds.has(u.id) && u.team !== 'red');
    GlobeEntity?.syncFriends?.([...blues, ...enrichedRed], { teamMode: true });
    const u = Commerce?.userLatLng?.() || window._lastPos || this.HOME;
    MapDepict?.pulse?.(u.lat, u.lng, this.TEAM_BLUE, '🔵 BLUE TEAM', 10000);
  },

  _declareVictory(payload) {
    if (this._team._victoryShown) return;
    this._team._victoryShown = true;
    this._team.won = true;
    const n = payload?.red_count || this._team.redCount || 0;
    const msg = '🏆 BLUE TEAM WINS — delivered burger/beer/pitogyro/mpironi/tsigareta to all ' + n + ' red players!';
    MapDepict?.action?.('play', { lat: this.HOME.lat, lng: this.HOME.lng, detail: msg });
    window.MapComms?.postSystem?.(msg);
    ACI?.feed?.('blue-victory', String(n) + ' red fed');
    this._gainXp(500, 'delivery');
    this._logField('pilot', 'blue_team_victory', { visual_truth: true, red_count: n });
    this.say(msg);
    setTimeout(() => { this._team._victoryShown = false; }, 60000);
  },

  teamsText() {
    const t = this._team;
    if (!t.redCount) {
      return [
        '── Blue vs Red · ΤΗΛΕΜΑΧΟΣ ──',
        '🔵 You are always BLUE TEAM',
        '🔴 Opponents = Cronian titans (Kronos leads) or live players on map',
        'Win: deliver πιτογύρο · burger · μπύρα/mpironi · τσιγάρα to EVERY red player',
        'Demo: players · kryfto · willa — 12 titans spawn as red team',
        'deliver red <name> pitogyra · teams · attack',
      ].join('\n');
    }
    const lines = [
      '── Blue vs Red · field warfare ──',
      '🔵 BLUE (us): you' + (this._blueAllyIds().length > 1 ? ' + ' + (this._blueAllyIds().length - 1) + ' allies' : ''),
      '🔴 RED: ' + t.redCount + ' · fed: ' + t.fed + '/' + t.redCount + (t.won ? ' · 🏆 WON' : ''),
    ];
    t.red.forEach((p, i) => {
      const fed = !(t.pending || []).find((x) => x.id === p.id);
      lines.push((i + 1) + '. ' + (fed ? '✓' : '🔴') + ' ' + p.name + ' · ' + p.lat.toFixed(3) + ',' + p.lng.toFixed(3));
    });
    if (t.pending?.length) {
      lines.push('Still need: ' + t.pending.map((p) => p.name).join(', '));
      lines.push('deliver red <name> pitogyra|beer|burger|tsigareta');
    } else if (!t.won) {
      lines.push('All fed — checking victory…');
    }
    return lines.join('\n');
  },

  async deliverToRed(targetQ, itemQuery) {
    if (!Auth?.user) {
      this.say('Sign in — blue team delivers to red rivals on real GPS');
      Auth?.signInGoogle?.();
      return { error: 'login_required' };
    }
    this._setEdition('telemachos');
    await this.refreshTeamStatus({ quiet: true });
    const red = this._findRedPlayer(targetQ);
    if (!red) {
      this.say('No red player — teams to list rivals on map');
      return { error: 'no_red_target' };
    }

    let wants = Commerce?.parseWantedItems?.(itemQuery || 'pitogyra') || [];
    wants = wants.filter((w) => this.WIN_ITEM_IDS.includes(w.id));
    if (!wants.length) wants = Commerce?.parseWantedItems?.('pitogyra beer')?.filter((w) => this.WIN_ITEM_IDS.includes(w.id)) || [];

    if (!wants.length) {
      this.say('Win items only: pitogyro · burger · mpironi/beer · tsigareta');
      return { error: 'no_win_items' };
    }

    await Commerce.loadVendors();
    const u = { lat: red.lat, lng: red.lng };
    const matches = [];
    Commerce.vendors.forEach((v) => {
      const m = Commerce.scoreVendorForWants(v, wants, u);
      if (m) matches.push(m);
    });
    matches.sort((a, b) => b.score - a.score);
    const pick = matches[0];
    if (!pick) {
      this.say('No vendor menu matches — try another item or vendor with menu');
      return { error: 'no_vendor_match' };
    }

    const orderItems = pick.picks.map((p) => ({ name: p.item.name, qty: 1, price: p.item.price || 0 }));
    const notes = 'BLUE→RED · ' + red.name + ' · ' + wants.map((w) => w.label).join('+');
    await Commerce.placeOrder(pick.vendor, orderItems, notes, false, {
      deliveryLat: red.lat,
      deliveryLng: red.lng,
      targetUserId: red.id,
      targetUser: red,
    });
    this.showPilot(red.lat, red.lng, 'telemachos');
    const msg = '🔵→🔴 OSRM delivery to ' + red.name + ' · ' + wants.map((w) => w.label).join(' · ');
    this.out(msg, 'ok');
    return { ok: true, target: red, wants };
  },

  async onTeamOrder(opts) {
    opts = opts || {};
    const target = opts.target;
    if (!target?.id) return;
    const winItem = this._resolveWinItemFromOrder(opts.items);
    if (!winItem) return;
    const r = await this.api({
      action: 'team_hit',
      red_target_id: target.id,
      item_type: winItem.id,
      order_id: opts.order?.id,
      lat: opts.deliveryLat ?? target.lat,
      lng: opts.deliveryLng ?? target.lng,
    });
    await this.refreshTeamStatus({ quiet: true });
    if (r.won) this._declareVictory(r);
    else if (r.ok) {
      const tag = r.already_fed ? 'already fed today' : 'hit logged';
      window.MapComms?.postSystem?.('🔵 ' + tag + ' · ' + (target.name || 'red') + ' · ' + winItem.label);
      this._gainXp(80, 'delivery');
    }
    return r;
  },

  _logField(action, detail, props) {
    FieldBrain?.pulse?.(action, detail, { role: 'pilot', props });
  },

  async _fetchOsrmRoute(fromLat, fromLng, toLat, toLng) {
    const url = 'https://router.project-osrm.org/route/v1/driving/'
      + fromLng + ',' + fromLat + ';' + toLng + ',' + toLat
      + '?overview=full&geometries=geojson';
    const r = await fetch(url);
    const j = await r.json();
    if (j.code !== 'Ok' || !j.routes?.[0]?.geometry?.coordinates) return null;
    return j.routes[0].geometry.coordinates.map((c) => ({ lng: c[0], lat: c[1] }));
  },

  _globePointsFromCoords(coords, alt) {
    const spec = this.DOMAINS.fpv;
    const a = alt ?? spec?.alt ?? 1.06;
    return (coords || []).map((c) => {
      const p = latLngToPos(c.lat, c.lng, a);
      return new THREE.Vector3(p.x, p.y, p.z);
    });
  },

  _syncGamerTelemetry() {
    const n = AstranovPresence?._live?.size ?? (others?.length || 0);
    if (n > this._evolution.gamers_seen) {
      this._gainXp((n - this._evolution.gamers_seen) * 12, 'live_gamers');
      this._evolution.gamers_seen = n;
      this._saveEvolutionLocal();
    }
  },

  _gainXp(amount, reason) {
    if (!this.edition.evolve && this._edition !== 'tilemaxos') return;
    this._evolution.xp += amount;
    const lvl = Math.floor(this._evolution.xp / 500) + 1;
    if (lvl > this._evolution.level) {
      this._evolution.level = lvl;
      this._evolution.power = 100 + (lvl - 1) * 35;
      MapDepict?.pulse?.(this.HOME.lat, this.HOME.lng, 0xff00aa, 'LEVEL ' + lvl, 6000);
    }
    if (reason === 'delivery') this._evolution.deliveries++;
    this._saveEvolutionLocal();
    this._logField('pilot', reason + ' +' + amount + 'xp', {});
  },

  norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/θ/g, 'th')
      .replace(/χ/g, 'ch')
      .replace(/ς/g, 's')
      .replace(/[^a-z0-9\u0370-\u03ffa-z\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  foldedGreek(s) {
    return this.norm(s)
      .replace(/[άα]/g, 'a')
      .replace(/[ήη]/g, 'e')
      .replace(/[ίι]/g, 'i')
      .replace(/[όοω]/g, 'o')
      .replace(/[ύυ]/g, 'y');
  },

  mentionsTelemachos(text) {
    const raw = String(text || '');
    if (/τηλεμαχ/i.test(raw)) return true;
    const n = this.foldedGreek(raw);
    return this.SPELLINGS_TELEMACHOS.some((sp) => {
      const f = this.foldedGreek(sp);
      return n.includes(f) || n.split(' ').some((w) => w.startsWith(f.slice(0, 5)) && f.length >= 5);
    });
  },

  mentionsTeledromos(text) {
    const raw = String(text || '');
    if (/τηλεδρομ/i.test(raw)) return true;
    const n = this.foldedGreek(raw);
    return this.SPELLINGS_TELEDROMOS.some((sp) => n.includes(this.foldedGreek(sp)));
  },

  mentionsTilemaxos(text) {
    const n = this.foldedGreek(text);
    return n.includes('tilemaxos') || n.includes('tilemax') || n.includes('telemaxos');
  },

  wantsIntro(text) {
    const n = this.foldedGreek(text);
    return /who are you|introduce|present yourself|say hello|tell me about|τι εισαι|παρουσιασ|γνωρισ|abilities|δυνατοτητες|skills|τι κανεις|what can you|editions|εκδοση/.test(n)
      || /^hi\b|^hello\b|^γεια\b/.test(n.trim());
  },

  wantsCmd(line) {
    const raw = String(line || '').trim();
    if (!raw) return false;
    const parts = raw.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const cmd = (parts[0] || '').toLowerCase().replace(/^"|"$/g, '');
    const cmds = [
      'telemachos', 'tilemaxos', 'telemachus', 'tilemachos', 'teledromos', 'teledromus',
      'pilot', 'drone', 'drones', 'fleet',
    ];
    if (cmds.includes(cmd)) return true;
    if (this.mentionsTelemachos(raw) || this.mentionsTeledromos(raw) || this.mentionsTilemaxos(raw)) return true;
    if (/takeover|take over|ανάληψη|αναληψη|hostile|αντιπαλ|opponent|fpv|flyback|fly back|rtb|return to pilot/.test(this.foldedGreek(raw))) return true;
    if (/blue team|red team|deliver red|attack red|team war|μπλε|κοκκιν/.test(this.foldedGreek(raw))) return true;
    if (this.wantsIntro(raw) && /pilot|drone|delivery|παραδοση|διανομε|gaming|commercial/.test(this.foldedGreek(raw))) return true;
    return false;
  },

  _setEdition(id) {
    if (this.EDITIONS[id]) this._edition = id;
    return this.edition;
  },

  _friendlyIds() {
    const ids = new Set();
    if (Auth?.user?.id) ids.add(Auth.user.id);
    (window.MapComms?.members ? [...window.MapComms.members.keys()] : []).forEach((id) => ids.add(id));
    return ids;
  },

  async scanAllDrones(opts) {
    opts = opts || {};
    this._syncGamerTelemetry();
    const r = await this.api({ action: 'scan' });
    if (!r.ok) {
      if (!opts.quiet) this.out('Scan failed — sign in · ' + (r.error || 'server'), 'err');
      this._fieldDrones = [];
      return [];
    }
    this._fieldDrones = (r.drones || []).map((d) => ({
      id: d.id,
      owner: d.owner,
      ownerId: d.owner_id,
      operatorId: d.operator_id,
      pilotLat: d.pilot_lat,
      pilotLng: d.pilot_lng,
      team: d.team,
      domain: d.domain,
      fpv: d.fpv || d.domain === 'fpv',
      status: d.status,
      lat: d.lat,
      lng: d.lng,
      signal: d.link_strength,
      link_mhz: d.link_mhz,
      mesh: this._fieldDrones.find((x) => x.id === d.id)?.mesh || null,
    }));
    this._hostile = this._fieldDrones.filter((d) => d.team !== 'friendly' && d.ownerId !== Auth?.user?.id);
    if (!opts.quiet) this._logField('drone_scan', r.count + ' registered drones', { visual_truth: true });
    return this._fieldDrones;
  },

  scanHostiles() {
    return this.scanAllDrones();
  },

  _findDrone(targetId) {
    const list = this._fieldDrones;
    const q = String(targetId || '').toLowerCase();
    if (!q) return list.find((d) => d.fpv) || list[0] || null;
    if (q === 'fpv' || q === 'goggles') return list.find((d) => d.fpv || d.domain === 'fpv') || null;
    if (q === 'any' || q === 'all') return list.find((d) => d.team !== 'friendly') || list[0] || null;
    return list.find((d) => d.id === targetId || String(d.id).includes(q))
      || list.find((d) => (d.owner || '').toLowerCase().includes(q))
      || list.find((d) => d.domain === q)
      || null;
  },

  _visualizeDrone(d) {
    if (d.mesh?.parent) return d.mesh;
    const spec = this.DOMAINS[d.domain] || this.DOMAINS.air;
    const col = d.captured ? 0x00ff88 : (d.fpv ? 0xff66cc : (d.team === 'friendly' ? 0x44aaff : 0xff2244));
    const mesh = this._meshForDomain(d.domain, col);
    const pos = latLngToPos(d.lat, d.lng, spec.alt);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.userData = { fieldDrone: true, id: d.id, owner: d.owner, fpv: !!d.fpv, captured: !!d.captured };
    globePivot.add(mesh);
    d.mesh = mesh;
    return mesh;
  },

  _visualizeHostile(h) {
    return this._visualizeDrone(h);
  },

  async flyBackToPilot(droneRec, targetMeta, opts) {
    opts = opts || {};
    const droneId = targetMeta?.id || droneRec?.meta?.fieldId;
    if (!droneId) return { error: 'no_drone_id' };

    const rtb = await this.api({ action: 'rtb', drone_id: droneId });
    if (!rtb.ok) {
      this.say('RTB failed — ' + (rtb.error || 'server'));
      return rtb;
    }
    this._applyEvolution(rtb.evolution);

    const from = rtb.from || { lat: targetMeta.lat, lng: targetMeta.lng };
    const to = rtb.to || { lat: targetMeta.pilotLat, lng: targetMeta.pilotLng };
    const spec = this.DOMAINS[targetMeta.domain] || this.DOMAINS.fpv;

    if (!droneRec?.mesh) {
      this._visualizeDrone({ ...targetMeta, lat: from.lat, lng: from.lng });
      droneRec = droneRec || {};
      droneRec.mesh = targetMeta.mesh;
      droneRec.domain = targetMeta.domain;
    }

    const osrm = await this._fetchOsrmRoute(from.lat, from.lng, to.lat, to.lng);
    let points;
    if (osrm?.length >= 2) {
      points = this._globePointsFromCoords(osrm, spec.alt);
      CityMap?.setRoute?.(osrm);
    } else {
      const routeData = RoutingEngine?.computeRoute?.(from.lat, from.lng, to.lat, to.lng, this._userObstacles());
      points = routeData?.points || this._globePointsFromCoords([from, to], spec.alt);
    }

    if (points?.length >= 2) {
      const routeGeo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(
        routeGeo,
        new THREE.LineBasicMaterial({ color: 0xff66cc, transparent: true, opacity: 0.55 })
      );
      globePivot.add(line);
      setTimeout(() => { if (line.parent) line.parent.remove(line); }, 120000);
    }

    droneRec.meta = { ...droneRec.meta, rtb: true, fieldId: droneId, pilot: rtb.owner };
    this._animateAlongRoute(droneRec, { points: points || [droneRec.mesh.position] }, {
      maxSteps: osrm ? 80 : 58,
      speed: 0.02,
      onComplete: async () => {
        await this.api({ action: 'handoff', drone_id: droneId, lat: to.lat, lng: to.lng });
        MapDepict?.pulse?.(to.lat, to.lng, 0xff66cc, '🥽 RTB · ' + (rtb.owner || 'pilot'), 9000);
        AIGraphics?.spawnEffect?.(droneRec.mesh?.position, 0xff66cc, 20, 45);
        const handoff = '🥽 OSRM RTB — ' + (targetMeta.domain || 'fpv') + ' returned to pilot ' + (rtb.owner || '');
        window.MapComms?.postSystem?.(handoff);
        ACI?.feed?.('tilemaxos-rtb', rtb.owner + ' · ' + targetMeta.domain);
        this._logField('drone_rtb', handoff, { visual_truth: true });
        this.out(handoff, 'ok');
        setTimeout(() => {
          if (droneRec.mesh?.parent) droneRec.mesh.parent.remove(droneRec.mesh);
          droneRec.mesh = null;
        }, 2800);
      },
    });

    const msg = 'RTB OSRM — ' + (targetMeta.domain || 'drone') + ' → pilot ' + (rtb.owner || '') + ' · ' + to.lat.toFixed(4) + ', ' + to.lng.toFixed(4);
    console.log('%c[tilemaxos] ' + msg, 'color:#ff66cc');
    if (!opts.quiet) this.say(msg);
    return { ok: true, rtb };
  },

  async takeover(targetId, opts) {
    opts = opts || {};
    if (!Auth?.user) {
      this.say('Sign in — real drone registry requires Supabase auth');
      Auth?.signInGoogle?.();
      return { error: 'login_required' };
    }
    this._setEdition('tilemaxos');
    if (this._edition === 'teledromos') {
      this.say('ΤΗΛΕΔΡΟΜΟΣ commercial — use telemachos/tilemaxos for C2 seize');
      return { error: 'commercial_locked' };
    }

    await this.scanAllDrones({ quiet: true });
    const q = String(targetId || 'fpv').toLowerCase();
    const target = this._findDrone(q);
    if (!target) {
      this.say('No registered drones on field — rivals must deploy: telemachos deploy fpv 1');
      return { error: 'no_drones' };
    }
    if (target.ownerId === Auth.user.id) {
      this.say('Cannot seize your own drone — scan for rival units');
      return { error: 'own_drone' };
    }

    this._visualizeDrone(target);
    const r = await this.api({
      action: 'seize',
      drone_id: target.id,
      edition: this._edition,
    });

    if (!r.seized) {
      AIGraphics?.spawnEffect?.(target.mesh?.position, 0xff4400, 14, 30);
      this.say('Seize failed — link ' + (r.link_strength?.toFixed(2) || '?') + ' · score ' + (r.seize_score ?? '?') + '/' + (r.min_score ?? '?') + ' · evolve');
      this._applyEvolution(r.evolution);
      this._logField('drone_seize', 'failed ' + target.domain, { link: r.link_strength });
      return { ok: false, target, ...r };
    }

    this._applyEvolution(r.evolution);
    if (target.mesh) {
      target.mesh.traverse((c) => {
        if (c.material?.color) c.material.color.setHex(target.fpv ? 0xff66cc : 0x00ff88);
      });
      target.captured = true;
      AIGraphics?.spawnEffect?.(target.mesh.position, target.fpv ? 0xff66cc : 0x00ff88, 28, 50);
    }

    const rec = this._registerDrone(target.domain, {
      captured: true,
      fieldId: target.id,
      from: target.owner,
      fpv: target.fpv,
    });
    rec.mesh = target.mesh;
    this._captured.push({ ...target, capturedAt: Date.now(), fleetId: rec.id, dbId: target.id });
    this._logField('drone_seize', (target.fpv ? 'FPV ' : '') + target.domain + ' · ' + target.owner, { visual_truth: true });

    const msg = '✓ seized ' + (target.fpv ? 'FPV ' : '') + target.domain + ' · link ' + r.link_strength + ' · score ' + r.seize_score + ' · RTB…';
    window.MapComms?.postSystem?.('⚔️ ' + msg);
    ACI?.feed?.('tilemaxos-takeover', target.domain + ' from ' + target.owner);

    if (opts.flyBack !== false) {
      await this.flyBackToPilot(rec, target, { quiet: true });
      this.say(msg + ' OSRM flyback to ' + target.owner);
    } else {
      this.say(msg);
    }
    await this.scanAllDrones({ quiet: true });
    return { ok: true, target, drone: r.drone, ...r };
  },

  out(text, cls) {
    AciCli?.print(text, cls || 'ok');
    return text;
  },

  say(text) {
    ACIControl?.reply(text);
    this.out(text, 'ok');
    if (Voice?.maySpeak?.()) speak(String(text).slice(0, 220), () => resumeListening?.());
    return text;
  },

  introduce(editionId) {
    if (editionId) this._setEdition(editionId);
    const e = this.edition;
    const lines = [
      'Εγώ είμαι ' + e.name_gr + ' (' + e.name_latin + ') — ' + e.tier + ' edition.',
      e.tagline,
    ];
    if (e.tier === 'gaming' || e.id === 'tilemaxos') {
      lines.push('Εξέλιξη με real gamers: level ' + this._evolution.level + ' · power ' + this._evolution.power + ' · takeovers ' + this._evolution.takeovers);
      lines.push('🔵 BLUE TEAM (always us) — win by delivering pitogyro/burger/mpironi/tsigareta to ALL 🔴 red players.');
      lines.push('tilemaxos: scan · takeover fpv · deliver red <name> · teams');
    }
    if (e.tier === 'commercial') {
      lines.push('Marketplace: deliver · drivers · vendors — χωρίς hostile takeover.');
    }
    lines.push('editions · abilities · fleet · deploy · scan · takeover');
    const msg = lines.join(' ');
    console.log('%c[' + e.name_gr + '] ' + msg, 'color:#00ddff');
    return this.say(msg);
  },

  editionsText() {
    return [
      '── Pilot editions ──',
      '🎮 ΤΗΛΕΜΑΧΟΣ — gaming · evolves with real users · most powerful model',
      '🏢 ΤΗΛΕΔΡΟΜΟΣ — commercial · marketplace delivery & drivers',
      '⚔️ tilemaxos — ANY drone takeover (FPV priority) · fly back to pilot',
      'Active: ' + this.edition.name_gr + ' (' + this.edition.tier + ')',
    ].join('\n');
  },

  abilitiesText() {
    const e = this.edition;
    const lines = [
      '── ' + e.name_gr + ' · δυνατότητες ──',
      '• Unlimited fleet — FPV 🥽 / air / ground / sea / underwater',
      '• Marketplace delivery (ΤΗΛΕΔΡΟΜΟΣ) — vendor → you · MapComms · drivers',
      '• Gaming evolution (ΤΗΛΕΜΑΧΟΣ) — XP from real users on globe · level ' + this._evolution.level,
      '• Blue vs Red — you are always 🔵 BLUE · rivals are 🔴 RED · feed all reds to win',
    ];
    if (e.takeover || e.id === 'tilemaxos') {
      lines.push('• Real C2 — pilot_drones DB · pilot-command edge · OSRM RTB · webrtc_signals handoff');
      lines.push('• Seize score = power − link_strength (haversine RF range) — no random rolls');
      this.EXTREME_TECH.forEach((t) => lines.push('  ⚡ ' + t.label + ' — ' + t.desc));
    }
    lines.push('• CLI: scan · takeover fpv · takeover any · flyback · rtb · evolve');
    return lines.join('\n');
  },

  evolveText() {
    this._syncGamerTelemetry();
    return [
      '── Evolution · ΤΗΛΕΜΑΧΟΣ gaming model ──',
      'Level: ' + this._evolution.level + ' · Power: ' + this._evolution.power,
      'XP: ' + this._evolution.xp + ' · Takeovers: ' + this._evolution.takeovers,
      'FPV captures: ' + (this._evolution.fpv_captures || 0) + ' · Flybacks to pilot: ' + (this._evolution.flybacks || 0),
      'Deliveries: ' + this._evolution.deliveries + ' · Live gamers seen: ' + this._evolution.gamers_seen,
      'Stronger with every real user on the map — no simulated grind.',
    ].join('\n');
  },

  scanText() {
    const list = this._fieldDrones;
    if (!list.length) {
      return 'No registered drones in Supabase — deploy yours: telemachos deploy fpv 1 · rivals too.';
    }
    const fpv = list.filter((d) => d.fpv);
    return [
      '── Field drones (ANY — tilemaxos can seize all) ──',
      'FPV units: ' + fpv.length + ' · total: ' + list.length,
      ...list.map((h, i) => {
        const tag = h.fpv ? '🥽 FPV' : h.domain;
        const team = h.team === 'friendly' ? '· ally' : '· ' + h.team;
        return (i + 1) + '. ' + h.id + ' · ' + tag + ' · ' + h.owner + team + ' · sig ' + h.signal.toFixed(2);
      }),
      'takeover fpv · takeover any · takeover <id> · flyback',
    ].join('\n');
  },

  fleetStatusText() {
    const lines = ['── Fleet · ' + this.NAME_GR + ' ──'];
    let total = 0;
    Object.entries(this.DOMAINS).forEach(([k, d]) => {
      const n = this._fleet[k].length;
      total += n;
      const cap = this._fleet[k].filter((x) => x.meta?.captured).length;
      const active = this._fleet[k].filter((x) => x.busy).length;
      lines.push(d.emoji + ' ' + d.label + ': ' + n + (cap ? ' (' + cap + ' captured)' : '') + (active ? ' · ' + active + ' busy' : ''));
    });
    lines.push('Field: ' + this._fieldDrones.length + ' · FPV: ' + this._fieldDrones.filter((d) => d.fpv).length + ' · Captured: ' + this._captured.length);
    lines.push('Edition: ' + this.edition.name_gr + ' · missions: ' + this._activeMissions.length);
    if (MarketplaceComms?.state?.orderId) {
      lines.push('📦 Order: ' + String(MarketplaceComms.state.orderId).slice(0, 8));
    }
    return lines.join('\n');
  },

  _registerDrone(domain, meta) {
    const id = 'tlm-' + (this._nextId++);
    const rec = { id, domain, busy: false, mesh: null, meta: meta || {} };
    this._fleet[domain].push(rec);
    return rec;
  },

  showPilot(lat, lng, editionId) {
    if (editionId) this._setEdition(editionId);
    const e = this.edition;
    if (AIGraphics?.spawnAstranovFlyer) {
      if (window._pilot?.parent) window._pilot.parent.remove(window._pilot);
      const col = e.id === 'tilemaxos' ? 0xff3366 : (e.color || 0x00ccff);
      window._pilot = AIGraphics.spawnAstranovFlyer(lat ?? this.HOME.lat, lng ?? this.HOME.lng, {
        edition: e, label: e.name_gr, color: col,
      });
      MapDepict?.pulse?.(lat ?? this.HOME.lat, lng ?? this.HOME.lng, col, e.name_gr, 12000);
      return window._pilot;
    }
    if (window._pilot && window._pilot.parent) window._pilot.parent.remove(window._pilot);

    const pos = latLngToPos(lat ?? this.HOME.lat, lng ?? this.HOME.lng, 1.04);
    const pilotGroup = new THREE.Group();
    const bodyColor = e.color || 0x00ccff;

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 10, 10),
      new THREE.MeshBasicMaterial({ color: bodyColor, transparent: true, opacity: 0.95 })
    );
    pilotGroup.add(body);

    const cockpit = new THREE.Mesh(
      new THREE.ConeGeometry(0.014, 0.032, 4),
      new THREE.MeshBasicMaterial({ color: e.id === 'tilemaxos' ? 0xff3366 : 0x00ff99 })
    );
    cockpit.rotation.x = Math.PI / 2;
    cockpit.position.z = 0.02;
    pilotGroup.add(cockpit);

    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.005, 0.01),
      new THREE.MeshBasicMaterial({ color: 0x0088ff })
    );
    wing.position.z = 0.005;
    pilotGroup.add(wing);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
    );
    pilotGroup.add(core);

    const thruster1 = new THREE.Mesh(
      new THREE.ConeGeometry(0.006, 0.018, 4),
      new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.7 })
    );
    thruster1.rotation.x = Math.PI / 2;
    thruster1.position.set(0.015, 0, -0.02);
    pilotGroup.add(thruster1);
    const thruster2 = thruster1.clone();
    thruster2.position.set(-0.015, 0, -0.02);
    pilotGroup.add(thruster2);

    pilotGroup.userData = { type: 'pilot', name: e.name_gr, edition: e.id, thrusters: [thruster1, thruster2] };
    pilotGroup.position.set(pos.x, pos.y, pos.z);
    globePivot.add(pilotGroup);
    window._pilot = pilotGroup;

    AIGraphics?.spawnEffect?.(pilotGroup.position, e.id === 'tilemaxos' ? 0xff3366 : 0x00ff99, 18, 55);
    MapDepict?.pulse?.(lat ?? this.HOME.lat, lng ?? this.HOME.lng, bodyColor, e.name_gr, 12000);
    return pilotGroup;
  },

  _meshForDomain(domain, overrideColor) {
    const spec = this.DOMAINS[domain] || this.DOMAINS.air;
    const col = overrideColor ?? spec.color;
    const g = new THREE.Group();
    g.userData = { domain, spec };

    if (domain === 'fpv') {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, 0.004, 0.012),
        new THREE.MeshBasicMaterial({ color: col })
      );
      g.add(frame);
      const cam = new THREE.Mesh(
        new THREE.SphereGeometry(0.005, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      cam.position.set(0, 0, 0.008);
      g.add(cam);
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003, 0.004, 0.004, 6),
        new THREE.MeshBasicMaterial({ color: 0x111111 })
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 0, 0.012);
      g.add(lens);
      const armA = new THREE.Mesh(
        new THREE.BoxGeometry(0.022, 0.002, 0.002),
        new THREE.MeshBasicMaterial({ color: col })
      );
      g.add(armA);
      const armB = armA.clone();
      armB.rotation.z = Math.PI / 2;
      g.add(armB);
      const vtx = new THREE.Mesh(
        new THREE.ConeGeometry(0.003, 0.008, 3),
        new THREE.MeshBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0.8 })
      );
      vtx.rotation.x = -Math.PI / 2;
      vtx.position.y = 0.006;
      g.add(vtx);
    } else if (domain === 'air') {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.02, 6),
        new THREE.MeshBasicMaterial({ color: col })
      );
      body.rotation.x = Math.PI / 2;
      g.add(body);
      const hub = new THREE.Mesh(
        new THREE.SphereGeometry(0.006, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x00ff88 })
      );
      hub.position.y = 0.01;
      g.add(hub);
      const arm1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.003, 0.003),
        new THREE.MeshBasicMaterial({ color: 0x0088ff })
      );
      g.add(arm1);
      const arm2 = arm1.clone();
      arm2.rotation.z = Math.PI / 2;
      g.add(arm2);
    } else if (domain === 'ground') {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.022, 0.008, 0.014),
        new THREE.MeshBasicMaterial({ color: col })
      );
      g.add(base);
      const wheel = new THREE.Mesh(
        new THREE.SphereGeometry(0.004, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x333333 })
      );
      wheel.position.set(0.008, -0.006, 0);
      g.add(wheel);
      const wheel2 = wheel.clone();
      wheel2.position.x = -0.008;
      g.add(wheel2);
    } else if (domain === 'sea') {
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(0.028, 0.006, 0.012),
        new THREE.MeshBasicMaterial({ color: col })
      );
      g.add(hull);
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.002, 0.002, 0.018, 4),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      mast.position.y = 0.012;
      g.add(mast);
    } else {
      const sub = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 8, 8),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 })
      );
      g.add(sub);
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.004, 0.012, 0.002),
        new THREE.MeshBasicMaterial({ color: 0x00aaff })
      );
      fin.position.y = 0.01;
      g.add(fin);
    }
    return g;
  },

  _userObstacles() {
    const out = [];
    (others || []).forEach((o) => {
      if (o.lat != null) out.push(latLngToPos(o.lat, o.lng, 1.025));
    });
    if (window._meMarker) out.push(window._meMarker.position);
    (Commerce?.driverMarkers || []).forEach((m) => { if (m?.position) out.push(m.position); });
    return out;
  },

  _animateAlongRoute(droneRec, routeData, opts) {
    if (!droneRec?.mesh || !routeData?.points?.length) return;
    const mesh = droneRec.mesh;
    const spec = this.DOMAINS[droneRec.domain] || this.DOMAINS.air;
    let steps = 0;
    let routeIdx = 0;
    const maxSteps = opts?.maxSteps || 48;
    const userPos = this._userObstacles();
    droneRec.busy = true;

    const tick = () => {
      steps++;
      if (routeIdx < routeData.points.length - 1) {
        const target = routeData.points[routeIdx + 1];
        mesh.position.lerp(target, 0.11 + (opts?.speed || 0));
        if (mesh.position.distanceTo(target) < 0.008) routeIdx++;
      }
      if (window._pilot && opts?.pilotFollow) {
        const final = routeData.points[routeData.points.length - 1];
        window._pilot.position.lerp(final, 0.18);
      }
      if (steps % 4 === 0) AIGraphics?.spawnEffect?.(mesh.position, spec.color, 6, 20);
      userPos.forEach((up) => {
        if (mesh.position.distanceTo(up) < 0.09) {
          console.log('%c[' + this.NAME_GR + '] proximity guard active', 'color:#ff8800');
        }
      });
      if (steps > maxSteps || routeIdx >= routeData.points.length - 1) {
        droneRec.busy = false;
        if (opts?.onComplete) {
          opts.onComplete(droneRec);
        } else if (!droneRec.meta?.captured && mesh.parent) {
          mesh.parent.remove(mesh);
          droneRec.mesh = null;
        }
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  async deploy(domain, count, opts) {
    opts = opts || {};
    if (!Auth?.user) {
      this.say('Sign in to register real drones in pilot_drones table');
      Auth?.signInGoogle?.();
      return { error: 'login_required' };
    }
    const d = String(domain || 'air').toLowerCase();
    if (!this.DOMAINS[d]) {
      this.say('Domain: fpv · air · ground · sea · underwater');
      return { error: 'bad_domain' };
    }
    const n = Math.max(1, Math.min(20, parseInt(count, 10) || 1));
    const u = Commerce?.userLatLng?.() || window._lastPos || this.HOME;
    const pilotLat = u.lat;
    const pilotLng = u.lng;
    const startLat = opts.startLat ?? pilotLat;
    const startLng = opts.startLng ?? pilotLng;
    const endLat = opts.endLat ?? startLat;
    const endLng = opts.endLng ?? startLng;
    const spec = this.DOMAINS[d];

    const deployed = [];
    for (let i = 0; i < n; i++) {
      const lat = startLat + (i - (n - 1) / 2) * 0.0008;
      const lng = startLng + (i - (n - 1) / 2) * 0.0006;
      const reg = await this.api({
        action: 'register',
        domain: d,
        lat, lng,
        pilot_lat: pilotLat,
        pilot_lng: pilotLng,
        link_mhz: d === 'fpv' ? 5800 : null,
        metadata: opts.meta || {},
      });
      if (!reg.ok) {
        this.out('Register failed: ' + (reg.error || 'server'), 'err');
        break;
      }
      const rec = this._registerDrone(d, { dbId: reg.drone?.id, registered: true });
      const mesh = this._meshForDomain(d);
      const pos = latLngToPos(lat, lng, spec.alt);
      mesh.position.set(pos.x, pos.y, pos.z);
      globePivot.add(mesh);
      rec.mesh = mesh;
      deployed.push(rec);
      this._logField('drone_register', d + ' · ' + reg.drone.id.slice(0, 8), { visual_truth: true });
    }

    const osrm = await this._fetchOsrmRoute(startLat, startLng, endLat, endLng);
    const points = osrm?.length >= 2
      ? this._globePointsFromCoords(osrm, spec.alt)
      : (RoutingEngine?.computeRoute?.(startLat, startLng, endLat, endLng, this._userObstacles())?.points || []);
    if (deployed[0] && points.length) {
      this._animateAlongRoute(deployed[0], { points }, { pilotFollow: true });
    }

    await this.scanAllDrones({ quiet: true });
    const msg = spec.emoji + ' ' + deployed.length + ' ' + spec.label + ' registered in pilot_drones · GPS ' + pilotLat.toFixed(4);
    this.out(msg, 'ok');
    return { ok: true, domain: d, count: deployed.length, deployed };
  },

  async coordinateMarketplaceDelivery(opts) {
    this._setEdition('teledromos');
    opts = opts || {};
    if (!Auth?.user) {
      this.say('Sign in — ΤΗΛΕΔΡΟΜΟΣ registers real drones in pilot_drones');
      Auth?.signInGoogle?.();
      return { error: 'login_required' };
    }
    const vendor = opts.vendor || Commerce?.selected || Commerce?.vendors?.[0];
    const u = {
      lat: opts.deliveryLat ?? Commerce?.userLatLng?.()?.lat ?? window._lastPos?.lat ?? this.HOME.lat,
      lng: opts.deliveryLng ?? Commerce?.userLatLng?.()?.lng ?? window._lastPos?.lng ?? this.HOME.lng,
    };
    const vLat = vendor?.lat ?? u.lat;
    const vLng = vendor?.lng ?? u.lng;
    const wants = opts.wants || opts.items?.map((i) => i.name).join(', ') || 'delivery';
    const driver = opts.driver || Commerce?._preferredDriver;
    const orderId = opts.order?.id || opts.orderId || MarketplaceComms?.state?.orderId || null;

    this.showPilot(u.lat, u.lng, 'teledromos');
    if (typeof flyToPoint === 'function') {
      const p = latLngToPos(u.lat, u.lng, 1.04);
      flyToPoint(new THREE.Vector3(p.x, p.y, p.z), GlobeControl?.Z?.national || 1.82);
      GlobeControl?.noteAutoFly?.();
    }

    const mission = {
      id: orderId || ('msn-' + Date.now()),
      edition: 'teledromos',
      vendor: vendor?.name,
      wants,
      driver: driver?.display_name || driver?.name || null,
      seekingDriver: !!opts.seekingDriver,
      orderId,
    };
    this._activeMissions.push(mission);

    const osrm = await this._fetchOsrmRoute(vLat, vLng, u.lat, u.lng);
    const routeCoords = osrm?.length >= 2 ? osrm : null;
    if (routeCoords) {
      CityMap?.setRoute?.(routeCoords);
      const points = this._globePointsFromCoords(routeCoords, this.DOMAINS.air.alt);
      const routeGeo = new THREE.BufferGeometry().setFromPoints(points);
      const routeLine = new THREE.Line(
        routeGeo,
        new THREE.LineBasicMaterial({ color: 0x3d9eff, transparent: true, opacity: 0.35 })
      );
      globePivot.add(routeLine);
      setTimeout(() => { if (routeLine.parent) routeLine.parent.remove(routeLine); }, 120000);
    } else {
      const routeData = RoutingEngine?.computeRoute?.(vLat, vLng, u.lat, u.lng, this._userObstacles());
      if (routeData?.points?.length) {
        const routeGeo = new THREE.BufferGeometry().setFromPoints(routeData.points);
        const routeLine = new THREE.Line(
          routeGeo,
          new THREE.LineBasicMaterial({ color: 0x3d9eff, transparent: true, opacity: 0.35 })
        );
        globePivot.add(routeLine);
        setTimeout(() => { if (routeLine.parent) routeLine.parent.remove(routeLine); }, 120000);
      }
    }

    const plan = opts.seekingDriver ? ['air', 'ground'] : ['air', 'ground'];
    const meta = {
      mission: mission.id,
      escort: !!driver,
      commercial: true,
      order_id: orderId,
      vendor: vendor?.name,
    };
    for (let i = 0; i < plan.length; i++) {
      await this.deploy(plan[i], 1, {
        startLat: vLat,
        startLng: vLng,
        endLat: u.lat,
        endLng: u.lng,
        meta,
      });
      if (i < plan.length - 1) await new Promise((r) => setTimeout(r, 350));
    }

    const driverTxt = driver
      ? 'Escorting ' + (driver.display_name || driver.name)
      : (opts.seekingDriver ? 'Seeking driver + drone relay' : 'Direct relay');
    const sys = '🏢 ΤΗΛΕΔΡΟΜΟΣ · ' + driverTxt + ' · ' + wants.slice(0, 80);
    window.MapComms?.postSystem?.(sys);
    ACI?.feed?.('teledromos-delivery', wants);
    this._logField('pilot', 'teledromos delivery · ' + wants.slice(0, 60), { order_id: orderId });
    this._gainXp(40, 'delivery');

    const msg = 'ΤΗΛΕΔΡΟΜΟΣ · OSRM route · ' + wants + '. ' + driverTxt + '.';
    console.log('%c[ΤΗΛΕΔΡΟΜΟΣ] ' + msg, 'color:#3d9eff');
    ACIControl?.reply(msg.slice(0, 200));
    return { ok: true, mission };
  },

  async runDemoDelivery() {
    const vendor = Commerce?.selected || Commerce?.vendors?.[0];
    const u = Commerce?.userLatLng?.() || window._lastPos || this.HOME;
    if (!vendor?.lat) {
      this.say('Open marketplace & pick a vendor — real GPS delivery, no demo coords');
      return { error: 'no_vendor' };
    }
    this._setEdition('telemachos');
    this.showPilot(u.lat, u.lng, 'telemachos');
    const wants = Commerce?._lastWants?.map((w) => w.label).join(' + ') || 'group order';
    ACI?.feed?.('group-order', wants);
    await this.coordinateMarketplaceDelivery({
      vendor,
      deliveryLat: u.lat,
      deliveryLng: u.lng,
      wants,
      driver: Commerce?._preferredDriver,
    });
    this._gainXp(25, 'delivery');
    this.say('ΤΗΛΕΜΑΧΟΣ gaming relay — real vendor GPS · evolve με gamers στο χάρτη.');
    return { ok: true };
  },

  _resolveCmd(line, p) {
    let cmd = (p[0] || '').toLowerCase().replace(/^"|"$/g, '');
    if (cmd === 'drone' || cmd === 'drones' || cmd === 'pilot') cmd = 'telemachos';
    if (['tilemaxos', 'tilemachos', 'telemachus'].includes(cmd)) cmd = 'telemachos';
    if (['teledromus'].includes(cmd)) cmd = 'teledromos';

    if (!['telemachos', 'teledromos', 'fleet'].includes(cmd)) {
      if (this.mentionsTeledromos(line)) return { cmd: 'teledromos', sub: p[1], p };
      if (this.mentionsTilemaxos(line)) return { cmd: 'telemachos', sub: 'tilemaxos', p };
      if (this.mentionsTelemachos(line)) return { cmd: 'telemachos', sub: p[1], p };
      if (/takeover|ανάληψη|αναληψη/.test(this.foldedGreek(line))) return { cmd: 'telemachos', sub: 'takeover', p, raw: line };
      if (/flyback|fly back|rtb|return to pilot|επιστροφη|γυρισμα/.test(this.foldedGreek(line))) return { cmd: 'telemachos', sub: 'flyback', p };
      if (/deliver red|attack red|blue team|red team|teams|μπλε|κοκκιν/.test(this.foldedGreek(line))) {
        if (/deliver red/.test(this.foldedGreek(line))) return { cmd: 'telemachos', sub: 'deliver', p: ['telemachos', 'deliver', 'red', ...p.slice(1)], raw: line };
        return { cmd: 'telemachos', sub: 'teams', p };
      }
      if (/scan|hostile|αντιπαλ|fpv/.test(this.foldedGreek(line))) return { cmd: 'telemachos', sub: 'scan', p };
    }
    return { cmd, sub: (p[1] || '').toLowerCase(), p };
  },

  async cli(parts, raw) {
    const line = String(raw || parts?.join(' ') || '').trim();
    const p = parts?.length ? parts : (line.match(/(?:[^\s"]+|"[^"]*")+/g) || []);
    const { cmd, sub, p: pp } = this._resolveCmd(line, p);
    const arg2 = (pp[2] || '').toLowerCase();
    const rest = pp.slice(1).join(' ');

    if (cmd === 'teledromos') {
      this._setEdition('teledromos');
      if (!sub || this.wantsIntro(sub + ' ' + rest)) { this.introduce('teledromos'); }
      else if (sub === 'deliver') {
        const vendor = Commerce?.selected || Commerce?.vendors?.[0];
        const u = Commerce?.userLatLng?.() || {};
        await this.coordinateMarketplaceDelivery({ vendor, deliveryLat: u.lat, deliveryLng: u.lng, wants: Commerce?._lastWants?.map((w) => w.label).join(' + ') || 'order' });
      } else if (sub === 'abilities') this.out(this.abilitiesText(), 'ok');
      else this.introduce('teledromos');
      GlobeDeck?.finishCliIfOneShot('teledromos');
      return { ok: true };
    }

    if (cmd === 'fleet' && !sub) {
      this.out(this.fleetStatusText(), 'ok');
      GlobeDeck?.finishCliIfOneShot('fleet');
      return { ok: true };
    }

    this._setEdition(sub === 'tilemaxos' || this.mentionsTilemaxos(line) ? 'tilemaxos' : 'telemachos');

    if (!sub || sub === 'hi' || sub === 'hello' || sub === 'γεια' || (this.wantsIntro(line) && !arg2)) {
      this.introduce(this._edition);
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'tilemaxos' || sub === 'extreme') {
      this._setEdition('tilemaxos');
      this.showPilot((Commerce?.userLatLng?.() || this.HOME).lat, (Commerce?.userLatLng?.() || this.HOME).lng, 'tilemaxos');
      this.out([
        '⚔️ tilemaxos — extreme tech on ΤΗΛΕΜΑΧΟΣ',
        'ANY drone · FPV priority · RTB to pilot after capture',
        ...this.EXTREME_TECH.map((t) => '  ' + t.label),
        'scan · takeover fpv · flyback',
      ].join('\n'), 'ok');
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'editions' || sub === 'edition') {
      this.out(this.editionsText(), 'ok');
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'teledromos' || sub === 'commercial') {
      this.introduce('teledromos');
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'abilities' || sub === 'skills' || sub === 'help') {
      this.out(this.abilitiesText(), 'ok');
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'evolve' || sub === 'power' || sub === 'level') {
      await this._loadEvolutionFromServer();
      this.out(this.evolveText(), 'ok');
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'fleet' || sub === 'status') {
      this.out(this.fleetStatusText(), 'ok');
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'teams' || sub === 'team' || sub === 'red' || sub === 'blue' || sub === 'attack' || sub === 'war') {
      await this.refreshTeamStatus();
      this.out(this.teamsText(), 'ok');
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'scan' || sub === 'hostiles' || sub === 'opponents' || sub === 'drones') {
      this._setEdition('tilemaxos');
      await this.scanAllDrones();
      this.out(this.scanText(), 'ok');
      this._fieldDrones.forEach((h) => this._visualizeDrone(h));
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'takeover' || sub === 'capture' || sub === 'hijack' || sub === 'seize') {
      this._setEdition('tilemaxos');
      const target = pp.slice(2).join(' ') || arg2 || 'fpv';
      await this.takeover(target);
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'flyback' || sub === 'rtb' || sub === 'return' || sub === 'home') {
      this._setEdition('tilemaxos');
      const q = pp.slice(2).join(' ') || arg2;
      const cap = this._captured[this._captured.length - 1];
      const rec = cap?.fleetId
        ? Object.values(this._fleet).flat().find((r) => r.id === cap.fleetId)
        : null;
      if (rec && cap) {
        await this.flyBackToPilot(rec, cap);
      } else if (q) {
        await this.scanAllDrones({ quiet: true });
        const t = this._findDrone(q);
        if (t) await this.takeover(t.id, { flyBack: true });
        else this.say('No match — scan then takeover fpv first.');
      } else {
        this.say('No captured drone — takeover fpv first, or flyback <id>.');
      }
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'show' || sub === 'locate') {
      const u = Commerce?.userLatLng?.() || this.HOME;
      this.showPilot(u.lat, u.lng, this._edition);
      this.say(this.NAME_GR + ' on globe · L' + this._evolution.level);
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'deploy' || sub === 'launch') {
      await this.deploy(arg2 || 'fpv', parseInt(pp[3], 10) || 1);
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'deliver' && arg2 === 'red') {
      const nameParts = [];
      const itemParts = [];
      pp.slice(3).forEach((x) => {
        if (/pitogy|burger|beer|mpir|μπυρ|τσιγαρ|pita|gyro|mpironi/i.test(x)) itemParts.push(x);
        else nameParts.push(x);
      });
      await this.deliverToRed(nameParts.join(' ') || 'all', itemParts.join(' ') || 'pitogyra');
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'deliver' || sub === 'coordinate') {
      if (arg2 === 'commercial') await this.coordinateMarketplaceDelivery({});
      else {
        this._setEdition('telemachos');
        const vendor = Commerce?.selected || Commerce?.vendors?.[0];
        const u = Commerce?.userLatLng?.() || {};
        this.showPilot(u.lat, u.lng, 'telemachos');
        await this.deploy('air', 2, { startLat: vendor?.lat, startLng: vendor?.lng, endLat: u.lat, endLng: u.lng });
        this._gainXp(30, 'delivery');
        this.say('ΤΗΛΕΜΑΧΟΣ gaming relay active.');
      }
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (sub === 'demo' || sub === 'grouporder') {
      await this.runDemoDelivery();
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }
    if (this.mentionsTelemachos(line) || this.mentionsTilemaxos(line)) {
      this.introduce(this._edition);
      GlobeDeck?.finishCliIfOneShot('telemachos');
      return { ok: true };
    }

    this.out('usage: teams · deliver red <name> pitogyra · scan · takeover fpv · flyback', 'dim');
    GlobeDeck?.finishCliIfOneShot('telemachos');
    return { ok: true };
  },
};

window.TelemachosPilot = Pilot;
window.showPilotTelemachos = function () { return Pilot.showPilot(); };
})();
