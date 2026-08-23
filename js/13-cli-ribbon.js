// === CLI RIBBON — one top bar: account · apps · status · + · expand ===
var CliRibbon = {
  _active: 'CLI',
  _notice: '',
  _kind: 'idle',

  TASK_LABEL: {
    coders: 'Grok',
    commerce: 'Shops',
    batch: 'Batch',
    radio: 'PMR',
    video: 'Video',
    add: 'Post',
    drive: 'Drive',
    phone: 'Phone',
    site: 'Site',
    cli: 'CLI',
    chats: 'Chats',
    dm: 'DM',
    team: 'Team',
    game: 'ΚΡΥΦΤό',
    telemachos: 'Pilot',
    compromised: '⚠ Alert',
    guest: 'Guest',
  },

  MOTTO_RE: /justice\s*→\s*truth\s*→\s*freedom|collective intelligence|Astranov\s*—|architect\s*·\s*collective|δικαιοσύνη|αλήθεια|ελευθερία/gi,
  GLOBE_HINT_RE: /city map|scroll\/pinch|pinch\/scroll|pinch out|return to globe|zoom.tier|zoom out|zoom in|double.tap|drag to spin/i,

  init() {
    const bar = document.getElementById('super-cli-bar');
    const header = document.getElementById('globe-deck-header');
    const fab = document.getElementById('super-add-fab');

    if (header) header.style.display = 'none';

    let status = document.getElementById('cli-ribbon-status');
    if (!status && bar) {
      status = document.createElement('span');
      status.id = 'cli-ribbon-status';
      status.setAttribute('aria-live', 'polite');
      if (fab) bar.insertBefore(status, fab);
      else bar.appendChild(status);
    }
    this._el = status;

    GlobeDeck?.bindHandle?.();

    this._active = 'CLI';
    this.render();
  },

  shorten(text) {
    let s = String(text || '').trim();
    if (!s) return '';
    s = s.replace(this.MOTTO_RE, '').replace(/\s+/g, ' ').trim();
    s = s.replace(/^Astranov\b/i, 'Astranov');
    s = s.replace(/\bcollective intelligence\b/gi, 'Astranov');
    s = s.replace(/\bNear-Earth orbit\b/gi, 'Above Earth');
    s = s.replace(/\bconstellations?\b/gi, 'sky');
    s = s.replace(/^Collective Coders\s*—\s*talk here$/i, 'Coders');
    s = s.replace(/^Coders online\s*—.*$/i, 'Coders');
    s = s.replace(/warming up.*$/i, '').trim();
    const low = s.toLowerCase();
    for (const [key, label] of Object.entries(this.TASK_LABEL)) {
      if (low === key || low.startsWith(key + ' ') || low.includes(key)) return label;
    }
    if (/^cli\b/i.test(s)) return 'CLI';
    if (s.length > 28) s = s.slice(0, 28).trim() + '…';
    return s || 'CLI';
  },

  setActive(text) {
    this._active = this.shorten(text) || this.TASK_LABEL[GlobeDeck?.activeTask] || 'CLI';
    this.render();
  },

  isGlobeHint(text) {
    return this.GLOBE_HINT_RE.test(String(text || ''));
  },

  clearGlobeHint() {
    if (this._notice && this.isGlobeHint(this._notice)) this.clearNotice();
  },

  setNotice(text, kind) {
    if (this.isGlobeHint(text)) return;
    const raw = String(text || '').trim();
    const s = (kind === 'ready' || kind === 'thinking')
      ? (raw.length > 100 ? raw.slice(0, 100).trim() + '…' : raw)
      : this.shorten(text);
    this._notice = s;
    if (kind) this._kind = kind;
    else if (/error|fail|denied/i.test(s)) this._kind = 'err';
    else if (/⏸|held|pause/i.test(s)) this._kind = 'hold';
    else if (/ready|located|on globe/i.test(s)) this._kind = 'ready';
    else if (s) this._kind = 'info';
    else this._kind = 'idle';
    this.render();
  },

  clearNotice() {
    this._notice = '';
    if (this._kind !== 'err') this._kind = 'idle';
    this.render();
  },

  render() {
    if (!this._el) return;
    const parts = [];
    const task = GlobeDeck?.activeTask;
    const active = this.TASK_LABEL[task] || this._active || 'CLI';
    parts.push(active);

    const open = AppShortcuts?._order?.filter(id => id !== task) || [];
    if (open.length) {
      parts.push('+' + open.map(id => AppShortcuts?.APPS?.[id]?.title || id).join(','));
    }

    if (GlobeDeck?.thinking) parts.push('thinking…');
    if ((typeof sessionHeld !== 'undefined' && sessionHeld) || SessionHold?.isHeld?.()) parts.push('held');
    if (window._handsFreeVoice) parts.push('hands-free');
    else if (isListening) parts.push('listening');

    if (Auth?.user) {
      const who = Auth._profileVisual?.avatar_emoji
        || (Auth.user.user_metadata?.full_name || Auth.user.email?.split('@')[0] || 'user').slice(0, 12);
      parts.push((Auth._authDegraded ? '⟳ ' : '● ') + who);
    } else parts.push('guest · sign in');

    if (window.SlumberManager?.tier && window.SlumberManager.tier !== 'full') {
      parts.push('⚡' + (window.SlumberManager.TIER_LABEL[window.SlumberManager.tier] || window.SlumberManager.tier));
    }
    if (this._notice) parts.push(this._notice);

    const line = parts.filter(Boolean).join(' · ').slice(0, 140);
    this._el.textContent = line;
    this._el.title = line;
    this._el.className = 'cli-ribbon-status'
      + (GlobeDeck?.thinking ? ' thinking' : '')
      + (this._kind === 'err' ? ' alert' : '')
      + (this._kind === 'hold' ? ' hold' : '')
      + (this._kind === 'ready' ? ' ready' : '');

    const title = document.getElementById('globe-deck-title');
    const preview = document.getElementById('globe-deck-preview');
    if (title) title.textContent = active;
    if (preview) preview.textContent = this._notice || '';
  },
};
window.CliRibbon = CliRibbon;
