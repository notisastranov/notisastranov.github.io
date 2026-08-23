// === YOUTUBE ON GLOBE — search + watch in Astranov deck ===
const GlobeVideo = {
  _results: [],
  _currentId: null,
  _lastQuery: '',

  PIPED: [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://api.piped.projectsegfau.lt',
  ],

  init() {
    document.getElementById('yt-close')?.addEventListener('click', () => this.hide());
    document.getElementById('yt-open-ext')?.addEventListener('click', () => {
      if (this._currentId) window.open('https://www.youtube.com/watch?v=' + this._currentId, '_blank', 'noopener');
    });
  },

  parseId(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    const m1 = s.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/i);
    if (m1) return m1[1];
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    return null;
  },

  async pipedSearch(query) {
    const q = encodeURIComponent(query);
    let lastErr = '';
    for (const base of this.PIPED) {
      try {
        const r = await fetch(base + '/search?q=' + q + '&filter=videos', {
          headers: { Accept: 'application/json' },
        });
        if (!r.ok) { lastErr = r.status + ' ' + base; continue; }
        const items = await r.json();
        if (!Array.isArray(items) || !items.length) { lastErr = 'empty ' + base; continue; }
        return items.slice(0, 8).map((it, i) => {
          const url = it.url || '';
          const id = it.id || this.parseId(url) || this.parseId('https://youtube.com' + url);
          return {
            id,
            title: it.title || ('Video ' + (i + 1)),
            channel: it.uploaderName || it.uploader || '',
            duration: it.duration || 0,
            thumbnail: it.thumbnail,
          };
        }).filter(v => v.id);
      } catch (e) {
        lastErr = String(e.message || e);
      }
    }
    throw new Error(lastErr || 'search failed');
  },

  showPanel(title) {
    GlobeDeck?.showStage('globe-youtube', 'video', title || 'YouTube on globe');
    SuperCli?.setContext?.('idle');
    const panel = document.getElementById('globe-youtube');
    if (panel) panel.classList.add('open', 'deck-active');
  },

  hide() {
    this.stop();
    document.getElementById('globe-youtube')?.classList.remove('open', 'deck-active');
    if (GlobeDeck?.activeTask === 'video') GlobeDeck?.completeTask('video');
    SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
  },

  stop() {
    const frame = document.getElementById('yt-frame');
    if (frame) frame.src = 'about:blank';
    this._currentId = null;
    SuperSpace?.stop?.();
  },

  renderResults(items, query) {
    const list = document.getElementById('yt-results');
    if (!list) return;
    list.innerHTML = '';
    items.forEach((v, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'yt-row';
      const mins = v.duration ? Math.floor(v.duration / 60) + ':' + String(v.duration % 60).padStart(2, '0') : '';
      row.innerHTML = '<span class="yt-n">' + (i + 1) + '</span>'
        + '<span class="yt-meta"><b>' + this.esc(v.title) + '</b>'
        + '<small>' + this.esc(v.channel) + (mins ? ' · ' + mins : '') + '</small></span>';
      row.onclick = () => this.play(v.id, v, this._lastQuery);
      list.appendChild(row);
    });
    const hint = document.getElementById('yt-hint');
    if (hint) hint.textContent = items.length
      ? 'Tap a result or type: play 2 · ' + query
      : 'No results — try another search';
  },

  esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  async play(videoId, meta, searchQuery) {
    const id = this.parseId(videoId);
    if (!id) {
      AciCli?.print('invalid video id', 'err');
      return;
    }
    this._currentId = id;
    const title = meta?.title || id;
    try {
      GlobeInfoTiles?.init?.();
      await (GlobeInfoTiles?.pinVideoFromMeta?.(searchQuery || title, { ...meta, id })
        || SuperSpace?.locateForMedia?.(searchQuery || title, { ...meta, id }));
    } catch (_) {}
    window.MapComms?.showCloudVideo?.(id, title);
    this.showPanel(title.slice(0, 48));
    const frame = document.getElementById('yt-frame');
    const titleEl = document.getElementById('yt-now-title');
    if (titleEl) titleEl.textContent = title;
    if (frame) {
      frame.src = 'https://www.youtube-nocookie.com/embed/' + id
        + '?autoplay=1&rel=0&modestbranding=1&playsinline=1';
    }
    GlobeDeck?.expand('YouTube · ' + title.slice(0, 40));
    AciCli?.print('▶ ' + title, 'ok');
    ACIControl?.reply('SuperSpace + SuperCli — ' + title.slice(0, 80));
    MapDepict?.action('video', { detail: title.slice(0, 40) });
    AciCoders?.observeActivity?.('youtube', title.slice(0, 80));
    FieldBrain?.pulse?.('media', 'youtube · ' + title.slice(0, 60), { role: 'client' });
  },

  async find(query) {
    this._lastQuery = String(query || '').trim();
    const q = String(query || '').trim();
    if (!q) {
      ACIControl?.reply('usage: youtube <search> · watch <url> · find video about …');
      return { error: 'empty' };
    }
    const direct = this.parseId(q);
    if (direct) {
      await this.play(direct, { title: q }, q);
      return { ok: true, id: direct };
    }

    this.showPanel('Searching YouTube…');
    GlobeDeck?.setThinking(true, 'Finding videos…');
    AciCli?.print('youtube search · ' + q, 'cmd');

    try {
      const items = await this.pipedSearch(q);
      this._results = items;
      this.renderResults(items, q);
      GlobeDeck?.setThinking(false);
      if (!items.length) {
        AciCli?.print('no videos found', 'err');
        return { error: 'empty' };
      }
      items.forEach((v, i) => {
        AciCli?.print((i + 1) + '. ' + v.title.slice(0, 70) + (v.channel ? ' · ' + v.channel : ''), 'dim');
      });
      ACIControl?.reply('Found ' + items.length + ' — brain locating #1 on globe');
      await this.play(items[0].id, items[0], q);
      return { ok: true, count: items.length };
    } catch (e) {
      GlobeDeck?.setThinking(false);
      const msg = 'YouTube search failed: ' + (e.message || e);
      AciCli?.print(msg, 'err');
      ACIControl?.reply('Search failed — try again or paste a youtube link');
      return { error: msg };
    }
  },

  async playIndex(n) {
    const idx = parseInt(n, 10) - 1;
    const v = this._results[idx];
    if (!v) {
      AciCli?.print('no result #' + n + ' — search first', 'err');
      return;
    }
    await this.play(v.id, v, this._lastQuery);
  },

  wantsYoutube(text) {
    const low = String(text || '').toLowerCase();
    return /youtube|youtu\.be|^yt\b|find\s+(me\s+)?(a\s+)?videos?\b|watch\s+.*video|βίντεο\s+(για|στο)|δες\s+(βίντεο|youtube)|παρακολούθησε|show\s+me\s+.*video/.test(low)
      || this.parseId(text);
  },

  queryFromText(text) {
    return String(text || '')
      .replace(/^(youtube|yt|find\s+videos?\s+(about|on|for)?|find\s+me\s+a\s+video\s+(about|on|for)?|watch\s+videos?\s+(about|on|for)?|watch|video\s+find|βίντεο\s+(για|στο)?|δες\s+βίντεο\s+(για|στο)?|παρακολούθησε)\s*/i, '')
      .trim();
  },
};
window.GlobeVideo = GlobeVideo;
