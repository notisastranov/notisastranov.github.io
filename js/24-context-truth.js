// === CONTEXT TRUTH — visual mirror of auth · channel · game · compromise ===
const ContextTruth = {
  compromised: null,
  _lastLabel: '',

  AUTH_KEEP: new Set(['astranov_auth_v2']),

  init() {
    setInterval(() => this.sync(), 2500);
    window.addEventListener('astranov-context', () => this.sync());
  },

  infer() {
    if (window.MapComms?.compromised || this.compromised) {
      const c = window.MapComms?.compromised || this.compromised;
      return {
        mode: 'compromised',
        ctx: 'compromised',
        label: '⚠ COMPROMISED · ' + (c.name || c.id?.slice(0, 8) || '?'),
        detail: 'Intruder: ' + (c.name || 'unknown'),
        intruder: c,
      };
    }
    if (AstranovPresence?.game === 'kryfto' || WillaGames?.active === 'kryfto') {
      const hidden = !!window.hidden;
      return {
        mode: 'game',
        ctx: 'game',
        label: hidden ? 'ΚΡΥΦΤό · hidden' : 'ΚΡΥΦΤό · hide & seek',
        detail: hidden ? 'You are hidden on the map' : 'ΣΥΓΥΡΙΣΜΑ · κρυφτό LIVE',
      };
    }
    if (AstranovPresence?.game === 'pyramid' || WillaGames?.active === 'pyramid') {
      return {
        mode: 'game',
        ctx: 'game',
        label: '🔺 Pyramid hunt',
        detail: 'Find apex markers · Giza · Rhodes · Chichen Itza',
      };
    }
    if (AstranovPresence?.game === 'willa' || WillaGames?.active === 'willa') {
      return {
        mode: 'game',
        ctx: 'game',
        label: '⚔ Willa game',
        detail: 'Olympians 🔵 vs Cronians 🔴 · Kronos leads red · multi-domain warfare',
      };
    }
    if (window.MapComms?.teamId && window.MapComms?.kind === 'dm' && window.MapComms?.dmUser) {
      return {
        mode: 'dm',
        ctx: 'dm',
        label: 'DM · ' + (window.MapComms.dmUser.name || 'User'),
        detail: 'Private cloud · ' + (window.MapComms.teamId || ''),
        peer: window.MapComms.dmUser,
      };
    }
    if (window.MapComms?.teamId && window.MapComms?.kind === 'team') {
      return {
        mode: 'team',
        ctx: 'team',
        label: 'Team · ' + (window.MapComms.teamName || 'Cloud'),
        detail: (window.MapComms.members?.size || 0) + ' on map cloud',
      };
    }
    if (MarketplaceComms?.teamId) {
      return {
        mode: 'market',
        ctx: 'commerce',
        label: 'Delivery · ' + (MarketplaceComms.teamName || 'order'),
        detail: 'Marketplace cloud',
      };
    }
    const task = GlobeDeck?.activeTask;
    if (task === 'coders' || window._aciCodersAlwaysOn) {
      return { mode: 'coders', ctx: 'coders', label: 'Coders · collective', detail: 'Task conversation · dev bridge' };
    }
    if (task === 'chats') {
      return { mode: 'chats', ctx: 'chats', label: 'CLI hub · search', detail: 'Users · conversations · transcripts' };
    }
    if (task === 'commerce') {
      return { mode: 'commerce', ctx: 'commerce', label: 'Shops · order', detail: 'Commerce task' };
    }
    if (task === 'batch') {
      return { mode: 'batch', ctx: 'batch', label: 'Batch · node', detail: 'Collaborative task' };
    }
    if (task === 'radio') {
      return { mode: 'radio', ctx: 'radio', label: 'PMR · radio', detail: 'VHF comms task' };
    }
    if (task === 'phone') {
      return { mode: 'phone', ctx: 'phone', label: 'Phone · call', detail: 'Voice call task' };
    }
    if (task === 'video') {
      return { mode: 'video', ctx: 'video', label: 'Video', detail: 'YouTube / video task' };
    }
    if (task === 'add') {
      return { mode: 'add', ctx: 'add', label: 'Super Add', detail: 'Post · vendor · site' };
    }
    if (GhostTravel?.active?.() && GhostTravel._target) {
      return {
        mode: 'travel',
        ctx: 'travel',
        label: '→ ' + GhostTravel._target.city,
        detail: 'Ghost route · ±' + GhostTravel.SCRAMBLE_KM + ' km mask · ' + GhostTravel.SPEED_KMH + ' km/h',
      };
    }
    if (TelemachosPilot?.edition && (GlobeDeck?.activeTask === 'telemachos' || window._pilot)) {
      return {
        mode: 'telemachos',
        ctx: 'telemachos',
        label: (TelemachosPilot.edition.name_gr || 'ΤΗΛΕΜΑΧΟΣ') + ' · pilot',
        detail: 'In-game drone field',
      };
    }
    if (DrivingView?.active) {
      return { mode: 'drive', ctx: 'drive', label: 'Drive · navigate', detail: 'Road routing' };
    }
    if (!Auth?.user) {
      return { mode: 'guest', ctx: 'guest', label: 'Guest · sign in', detail: 'Not authenticated' };
    }
    return { mode: 'cli', ctx: 'idle', label: 'CLI · central', detail: 'Astranov' };
  },

  syncAuth() {
    this.sync();
  },

  setCompromised(intruder) {
    this.compromised = intruder || null;
    if (intruder) {
      CliRibbon?.setNotice?.('⚠ compromised · ' + (intruder.name || '?'), 'err');
      window.MapComms?._applyCloudTruth?.();
    }
    this.sync();
  },

  clearCompromised() {
    this.compromised = null;
    if (window.MapComms) window.MapComms.compromised = null;
    window.MapComms?._applyCloudTruth?.();
    CliRibbon?.clearNotice?.();
    this.sync();
  },

  sync() {
    const ctx = this.infer();
    const bar = document.getElementById('super-cli-bar');
    const deck = document.getElementById('globe-deck');
    if (bar) {
      bar.dataset.truth = ctx.ctx;
      bar.dataset.mode = ctx.mode;
    }
    if (deck) deck.dataset.truth = ctx.mode;

    const cloud = document.getElementById('map-comms-cloud');
    if (cloud?.classList.contains('open')) {
      cloud.dataset.truth = ctx.mode === 'compromised' ? 'compromised' : (window.MapComms?.kind || 'team');
      this._renderCloudBadge(ctx);
    }

    const label = ctx.label;
    if (label !== this._lastLabel) {
      this._lastLabel = label;
      CliRibbon?.setActive?.(label);
      if (GlobeDeck?.expanded && ctx.mode !== 'cli' && ctx.mode !== 'idle' && ctx.mode !== 'guest') {
        GlobeDeck?.setPreview?.(ctx.detail);
      }
    }
    SuperCli?.setContext?.(ctx.ctx);
    CliRibbon?.render?.();
    this._renderAuthChip(ctx);
  },

  _renderAuthChip(ctx) {
    const chip = document.getElementById('user-chip');
    if (!chip || !Auth?.user) return;
    const channel = ctx.mode === 'compromised' ? ' · ⚠ INTRUSION'
      : ctx.mode === 'dm' ? ' · DM'
      : ctx.mode === 'team' ? ' · TEAM'
      : ctx.mode === 'game' ? ' · ΚΡΥΦΤό'
      : ctx.mode === 'telemachos' ? ' · PILOT'
      : ctx.mode === 'coders' ? ' · CODERS'
      : '';
    if (!AstranovSession?.isAstranov?.() && !Auth.isOwner && channel) {
      const base = chip.textContent?.split(' · ')[0] || Auth.user.email?.split('@')[0] || 'User';
      chip.textContent = (base + channel).slice(0, 52);
      chip.title = ctx.detail || ctx.label;
    }
  },

  _renderCloudBadge(ctx) {
    let badge = document.getElementById('mc-badge');
    const head = document.getElementById('mc-head');
    if (!head) return;
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'mc-badge';
      head.insertBefore(badge, head.querySelector('#mc-close'));
    }
    if (ctx.mode === 'compromised' && ctx.intruder) {
      badge.className = 'mc-badge mc-badge-alert';
      badge.innerHTML = '⚠ <button type="button" class="mc-intruder" data-intruder="' + (ctx.intruder.id || '') + '">'
        + String(ctx.intruder.name || 'intruder').replace(/[<>&"]/g, '') + '</button>';
      badge.querySelector('.mc-intruder')?.addEventListener('click', () => {
        CliHub?.viewUser?.(ctx.intruder.id);
        ACIControl?.reply('Compromised cloud — intruder: ' + (ctx.intruder.name || ctx.intruder.id));
      });
    } else if (window.MapComms?.kind === 'dm') {
      badge.className = 'mc-badge mc-badge-dm';
      badge.textContent = '🔒 private';
    } else if (window.MapComms?.kind === 'team') {
      badge.className = 'mc-badge mc-badge-team';
      badge.textContent = '◎ team';
    } else {
      badge.className = 'mc-badge';
      badge.textContent = '';
    }
  },
};
window.ContextTruth = ContextTruth;
