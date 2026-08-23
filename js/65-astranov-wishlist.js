// === ASTRANOV WISHLIST — recover requests across all devices ===
const AstranovWishlist = {
  MAX: 48,
  items: [],

  SEED: [
    { text: 'Unify user + session across all computers (one ASTRANOV, one collective session)', status: 'done', tag: 'session' },
    { text: 'City map on zoom — satellite, streets, routing, friends, moving drivers', status: 'done', tag: 'globe' },
    { text: 'Starship F13 launch sim on globe (Starbase timeline)', status: 'done', tag: 'globe' },
    { text: 'Starlink LEO real-ish positions (CelesTrak + analytic shells)', status: 'done', tag: 'globe' },
    { text: 'SpaceNet multi-crawlers (vendors/weather/drivers/news/tasks)', status: 'done', tag: 'spacenet' },
    { text: 'City tasks + delivery claim/assign infrastructure', status: 'done', tag: 'commerce' },
    { text: 'Dark/bright theme toggle + CLI commands (dark, bright, theme)', status: 'done', tag: 'ui' },
    { text: 'Real Earth — day/night terminator, sun, moon', status: 'done', tag: 'globe' },
    { text: 'Super Add + inline in CLI bar, right edge, normal size', status: 'done', tag: 'ui' },
    { text: 'City view zoom-out trap — scroll/pinch returns to globe', status: 'done', tag: 'globe' },
    { text: 'Voice hands-free UX — mic stays listening between commands', status: 'done', tag: 'voice' },
    { text: 'Tiered smooth zoom — city → national → earth → orbit → solar → galaxy', status: 'done', tag: 'globe' },
    { text: 'Pinch/scroll zoom only — no rotation while two-finger zooming', status: 'done', tag: 'globe' },
    { text: 'Coders always online — listening, evolving brain for all users', status: 'done', tag: 'brain' },
    { text: 'CLI flood reduction — quiet locate/status, unified globe deck', status: 'done', tag: 'ui' },
    { text: 'Astranov Sites — instant subdomain provision via + or collective', status: 'done', tag: 'sites' },
    { text: 'Uniform login across globe + subdomains (Google, email, phone)', status: 'done', tag: 'auth' },
    { text: 'Google OAuth show Astranov not suspicious Supabase ref — api.astranov.eu', status: 'pending', tag: 'auth' },
    { text: 'Uniform subdomain site templates (frogschool, yachts, vendors)', status: 'done', tag: 'sites' },
    { text: 'Profile page for every user/vendor — tap to open, fill on demand', status: 'done', tag: 'sites' },
    { text: 'Subdomain on admin approval · profile live immediately', status: 'done', tag: 'sites' },
    { text: 'Yacht matcher — demand/supply, captain+crew, 300/200/100 EUR per day', status: 'done', tag: 'commerce' },
    { text: 'Universal match engine in superbooking — all business types, activatable fields, Coders field requests', status: 'done', tag: 'sites' },
    { text: 'Hellenic canon — Greek mythology & philosophy as Coders truth layer', status: 'done', tag: 'brain' },
    { text: 'Logged-in users on map — collab + κρυφτό hide-and-seek', status: 'done', tag: 'globe' },
    { text: 'Map team polygon + cloud chat + video/voice/phone/message any user', status: 'done', tag: 'comms' },
    { text: 'Marketplace task polygon + cloud chat — client picks delivery driver on map', status: 'done', tag: 'commerce' },
    { text: 'Real user scenarios — 8 automated tests passing before batch push', status: 'done', tag: 'qa' },
  ],

  init() {
    if (!AstranovSession?.CLOUD_ONLY) this._loadLocal();
    if (!this.items.length && !Auth?.user) this._seed();
    window.addEventListener('astranov-session-pulled', () => this._onRemote());
  },

  _key() {
    const uid = Auth?.user?.id || 'guest-' + (AstranovSession?.deviceId?.() || 'local');
    return 'astranov_wishlist_v1_' + uid.slice(0, 12);
  },

  _loadLocal() {
    try {
      const raw = localStorage.getItem(this._key());
      if (raw) this.items = JSON.parse(raw);
    } catch { this.items = []; }
  },

  _saveLocal() {
    if (AstranovSession?.CLOUD_ONLY && Auth?.user) {
      AstranovSession?.push?.();
      return;
    }
    try { localStorage.setItem(this._key(), JSON.stringify(this.items.slice(0, this.MAX))); } catch (_) {}
  },

  _seed() {
    const now = Date.now();
    this.items = this.SEED.map((s, i) => ({
      id: 'seed-' + i,
      text: s.text,
      status: s.status,
      tag: s.tag || 'general',
      source: 'recovered',
      deviceId: 'seed',
      at: now - (this.SEED.length - i) * 60000,
    }));
    this._saveLocal();
  },

  _norm(text) {
    return String(text || '').trim().replace(/\s+/g, ' ').slice(0, 400);
  },

  _dup(text) {
    const n = this._norm(text).toLowerCase();
    return this.items.some(it => this._norm(it.text).toLowerCase() === n);
  },

  add(text, opts) {
    opts = opts || {};
    const t = this._norm(text);
    if (!t || t.length < 4) return null;
    if (this._dup(t)) return null;
    const item = {
      id: 'w-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: t,
      status: opts.status || 'pending',
      tag: opts.tag || 'user',
      source: opts.source || AstranovSession?.deviceId?.() || 'local',
      deviceId: AstranovSession?.deviceId?.() || 'local',
      at: Date.now(),
    };
    this.items.unshift(item);
    if (this.items.length > this.MAX) this.items.length = this.MAX;
    this._saveLocal();
    AstranovSession?.push?.();
    return item;
  },

  markDone(match) {
    const m = String(match || '').toLowerCase();
    let hit = false;
    this.items.forEach(it => {
      if (it.status === 'done') return;
      if (it.id === match || it.text.toLowerCase().includes(m)) {
        it.status = 'done';
        it.doneAt = Date.now();
        hit = true;
      }
    });
    if (hit) { this._saveLocal(); AstranovSession?.push?.(); }
    return hit;
  },

  pending() {
    return this.items.filter(it => it.status !== 'done');
  },

  snapshot() {
    return this.items.slice(0, this.MAX);
  },

  mergeRemote(list) {
    if (!Array.isArray(list) || !list.length) return 0;
    let added = 0;
    list.forEach(remote => {
      const t = this._norm(remote?.text);
      if (!t) return;
      if (this._dup(t)) return;
      this.items.push({
        id: remote.id || ('r-' + added + '-' + Date.now().toString(36)),
        text: t,
        status: remote.status || 'pending',
        tag: remote.tag || 'remote',
        source: remote.source || remote.deviceId || 'remote',
        deviceId: remote.deviceId || 'remote',
        at: remote.at || Date.now(),
      });
      added++;
    });
    this.items.sort((a, b) => (b.at || 0) - (a.at || 0));
    if (this.items.length > this.MAX) this.items.length = this.MAX;
    if (added) this._saveLocal();
    return added;
  },

  applyRemote(list) {
    const n = this.mergeRemote(list);
    if (n > 0) this._announce(n);
    return n;
  },

  _onRemote() {
    const snap = AstranovSession?._lastRemote;
    if (snap?.wishlist?.length) this.applyRemote(snap.wishlist);
  },

  announceRecovered() {
    const pending = this.pending();
    if (!pending.length) return;
    const fromOther = pending.filter(it => it.source && it.source !== 'seed' && it.deviceId !== AstranovSession?.deviceId?.());
    AciCli?.print('── Recovered from your other devices ──', 'dim');
    pending.slice(0, 8).forEach((it, i) => {
      const src = it.source === 'recovered' || it.source === 'seed' ? 'archive' : (it.source || 'device').slice(0, 12);
      AciCli?.print((i + 1) + '. [' + (it.status === 'done' ? '✓' : '○') + '] ' + it.text.slice(0, 120), it.status === 'done' ? 'dim' : 'ok');
    });
    if (fromOther.length) {
      AciCli?.print(fromOther.length + ' request(s) synced from another computer — type requests to list', 'ok');
    } else {
      AciCli?.print('Type requests · wishlist · sync — no need to retype', 'dim');
    }
    GlobeDeck?.setPreview?.('◎ ' + pending.length + ' collective request(s) recovered');
  },

  _announce(n) {
    AciCli?.print('◎ Synced ' + n + ' request(s) from another device', 'ok');
  },

  captureCliLine(line) {
    const t = this._norm(line);
    if (!t || t.length < 12) return;
    if (/^(help|\?|locate|me|ping|hold|resume|stop|sync|requests|wishlist)\b/i.test(t)) return;
    this.add(t, { source: 'cli', tag: 'cli', status: 'pending' });
  },
};
window.AstranovWishlist = AstranovWishlist;
