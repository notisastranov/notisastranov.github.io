// === 3D RESPONSIVENESS — instant ack + parallel fast think (CLI · voice · globe) ===
const Responsive3D = {
  FAST_MS: 8000,
  _pending: 0,
  _origThink: null,
  _origConverse: null,

  ACKS: [
    '◎ On it…',
    '◎ Globe synced…',
    '◎ Thinking fast…',
    '◎ 3D path active…',
    '◎ Collective pulse…',
  ],

  init() {
    this._wrapACI();
    this._wrapBrain();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && OrderTracking?.active) OrderTracking.refresh({ quiet: true });
    });
  },

  _pickAck(text) {
    const low = String(text || '').toLowerCase();
    if (/order|παραγγελ|delivery|διανομ/.test(low)) return '🛒 Tracking on globe…';
    if (/locate|gps|where|που/.test(low)) return '📍 Flying to you…';
    if (/profile|login|account|ρόλ/.test(low)) return '👤 Profile orbit…';
    if (/coin|wallet|Coins|balance/.test(low)) return '◎ Coins pulse…';
    return this.ACKS[this._pending % this.ACKS.length];
  },

  instantAck(text, source) {
    const ack = this._pickAck(text);
    this._pending++;
    GlobeDeck?.say?.(ack, 'dim');
    CliRibbon?.setNotice?.(ack);
    const pos = window._lastPos || { lat: 36.44, lng: 28.22 };
    MapDepict?.pulse?.(pos.lat, pos.lng, 0x3d9eff, ack.replace(/^[^\s]+\s*/, ''), 2800);
    if (source === 'voice' && Voice.maySpeak?.()) {
      speak(ack.replace(/◎\s*/, '').slice(0, 48), () => {}, true);
    }
    return ack;
  },

  visualReact(kind, opts) {
    opts = opts || {};
    const lat = opts.lat ?? opts.order?.delivery_lat ?? window._lastPos?.lat;
    const lng = opts.lng ?? opts.order?.delivery_lng ?? window._lastPos?.lng;
    if (lat == null) return;

    const colors = {
      think: 0x3d9eff,
      order: 0x00ddff,
      order_update: 0x00ff88,
      track: 0x44ccff,
      profile: 0x49b7ff,
      voice: 0x69f5d0,
    };
    const color = colors[kind] || 0x3d9eff;
    MapDepict?.pulse?.(lat, lng, color, kind, 4200);

    if (kind === 'profile' || kind === 'track' || kind === 'order') {
      const z = kind === 'profile' ? (GlobeControl?.Z?.national || 1.82) : (GlobeControl?.Z?.regional || 1.65);
      const dur = GlobeControl?.flyDuration?.(camera?.position?.z, z) || 2200;
      GlobeControl?.flyToLatLng?.(lat, lng, kind, z, { dur });
    }

    if (window.AIGraphics && kind === 'think') {
      const p = latLngToPos(lat, lng, 1.05);
      AIGraphics.spawnEffect(new THREE.Vector3(p.x, p.y, p.z), color, 4, 14);
    }
  },

  _wrapACI() {
    if (!window.ACI || this._origThink) return;
    this._origThink = ACI.think.bind(ACI);
    ACI.think = async (prompt, opts = {}) => {
      if (!opts._noAck) {
        this.instantAck(prompt, opts.fromVoice ? 'voice' : 'cli');
        this.visualReact('think', {});
      }
      GlobeDeck?.setThinking(true, '◎ 3D think…');
      const out = await this._origThink(prompt, { ...opts, fast: true, _wrapped: true });
      GlobeDeck?.setThinking(false);
      return out;
    };
  },

  _wrapBrain() {
    if (!window.BrainConversation || this._origConverse) return;
    this._origConverse = BrainConversation.converse.bind(BrainConversation);
    BrainConversation.converse = async (text, opts = {}) => {
      const prompt = String(text || '').trim();
      if (!prompt) return '';
      const wantsThink = opts.forceThink || prompt.length > 20 || /[?]/.test(prompt)
        || /^(explain|why|how|what|tell|describe|ποιος|τι|γιατί|πες)\b/i.test(prompt);
      if (!wantsThink) return this._origConverse(text, opts);

      const local = BrainConversation._matchLocal(prompt);
      if (local && !opts.forceThink && prompt.length < 28) {
        ACI?.history?.push?.({ role: 'user', content: prompt });
        ACI?.history?.push?.({ role: 'assistant', content: local });
        ACIControl?.reply(local);
        return local;
      }

      if (window.ACI && this._origThink) {
        const out = await ACI.think(prompt, { fast: true, fromVoice: opts.fromVoice });
        if (out && !/^ACI error:/i.test(out)) return out;
      }
      return this._origConverse(text, { ...opts, forceThink: true });
    };
  },

  async fastConverse(text, opts = {}) {
    return BrainConversation?.converse?.(text, { ...opts, forceThink: true });
  },
};

window.Responsive3D = Responsive3D;
