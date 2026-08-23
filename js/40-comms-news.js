// ── COMMS: phone + EU PMR (real audio, no simulation) ──
const Comms = {
  vhfActive: false,
  pmr: { channel: 11, freqMHz: 446.13125, label: 'EU PMR 11' },

  async startPhone() {
    await SuperCli?.run('phone');
  },

  startVHF() {
    if (this.vhfActive && PmrRadio?.open) {
      GlobeDeck?.showStage('sat-radio', 'radio');
      return;
    }
    this.vhfActive = true;
    PmrRadio.show();
  },

  startTelecomms() {
    this.startVHF();
  }
};

// ── NEWS (real RSS) ──
const NewsFeed = {
  items: [],
  async fetch() {
    try {
      const url = 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://feeds.bbci.co.uk/news/world/rss.xml');
      const r = await fetch(url);
      const xml = await r.text();
      const titles = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?([^\]<]+)/g)].map(m => m[1]).filter(t => t.length > 12 && !t.includes('BBC'));
      const max = SlumberManager?.quality?.newsMax ?? 8;
      this.items = max > 0 ? titles.slice(0, max) : [];
    } catch { this.items = ['Astranov online', 'Globe ready', 'Order · chat · post nearby']; }
    this.tick();
  },
  tick() {
    if (!SlumberManager?.allows?.('news')) return;
    if (!this.items.length) return;
    const interval = SlumberManager?.tickMs?.('news') || 12000;
    if (!interval) return;
    const i = Math.floor(Date.now() / interval) % this.items.length;
    const line = (AstroGlyphs?.news || '📰') + ' ' + this.items[i];
    if (GlobeDeck && !GlobeDeck.thinking && !GlobeDeck._userEngaged) {
      GlobeDeck.setPreview(line);
    }
  },
  flash() {
    SlumberManager?.wake?.('news', 'news');
    this.fetch();
    const u = window._lastPos || { lat: 36.44, lng: 28.22 };
    MapDepict.action('news', { lat: u.lat, lng: u.lng, detail: (this.items[0] || '').slice(0, 50) });
    GlobeControl?.flyToLatLng?.(u.lat, u.lng, 'news', GlobeControl?.Z?.global);
    if (Voice.maySpeak()) speak((this.items[0] || 'News').slice(0, 100), () => resumeListening());
  }
};
window.Comms = Comms;
window.NewsFeed = NewsFeed;
