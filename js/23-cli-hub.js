// === CLI HUB — cloud transcripts · search users/chats · private cloud DM ===
const CliHub = {
  _pending: [],
  _flushTimer: null,
  _viewUserId: null,
  _searchDebounce: null,

  init() {
    this._bindUi();
    if (Auth?.client) {
      Auth.client.auth.onAuthStateChange((_e, s) => {
        if (s?.user) this._subscribe();
        else this._viewUserId = null;
      });
    }
    setTimeout(() => { if (Auth?.user) this._subscribe(); }, 2000);
  },

  async api(body) {
    const headers = Auth?.authHeaders ? await Auth.authHeaders() : { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
    const r = await fetch(SB_URL + '/functions/v1/cli-hub', {
      method: 'POST', headers,
      body: JSON.stringify(body),
    });
    return r.json().catch(() => ({ error: 'network' }));
  },

  canViewAll() {
    return !!(AstranovSession?.isAstranov?.() || Auth?.isOwner);
  },

  queueLine(line, cls, opts) {
    if (!Auth?.user || !line) return;
    opts = opts || {};
    this._pending.push({
      line: String(line).slice(0, 2000),
      cls: String(cls || 'out').slice(0, 24),
      circle_id: opts.circle_id || window.MapComms?.teamId || null,
      peer_id: opts.peer_id || window.MapComms?.dmUser?.id || null,
    });
    if (this._pending.length > 32) this._pending = this._pending.slice(-32);
    if (!this._flushTimer) {
      this._flushTimer = setTimeout(() => this._flush(), 1800);
    }
  },

  async _flush() {
    this._flushTimer = null;
    if (!this._pending.length || !Auth?.user) return;
    const batch = this._pending.splice(0, 24);
    await this.api({ action: 'append', lines: batch });
  },

  _bindUi() {
    const search = document.getElementById('cli-hub-search');
    const btn = document.getElementById('cli-hub-search-btn');
    if (search && !search.dataset.bound) {
      search.dataset.bound = '1';
      search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.runSearch(search.value); }
        if (e.key === 'Escape') this.closePanel();
      });
      search.addEventListener('input', () => {
        clearTimeout(this._searchDebounce);
        const q = search.value.trim();
        if (q.length < 2) return;
        this._searchDebounce = setTimeout(() => this.runSearch(q), 420);
      });
    }
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const q = document.getElementById('cli-hub-search')?.value?.trim();
        if (q) this.runSearch(q);
        else this.openPanel();
      });
    }
    const panel = document.getElementById('cli-hub-panel');
    if (panel && !panel.dataset.bound) {
      panel.dataset.bound = '1';
      panel.addEventListener('click', (e) => {
        const el = e.target.closest('[data-ch-action]');
        if (!el) return;
        const act = el.dataset.chAction;
        const uid = el.dataset.chUser;
        const cid = el.dataset.chCircle;
        if (act === 'view' && uid) this.viewUser(uid);
        if (act === 'dm' && uid) this.startPrivateCloud(uid);
        if (act === 'chat' && cid) window.MapComms?.joinTeam?.(cid);
      });
    }
  },

  esc(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  openPanel() {
    GlobeDeck?.showStage?.('cli-hub-panel', 'chats');
    GlobeDeck?.expand?.('CLI · search');
    document.getElementById('cli-hub-bar')?.classList.add('open');
    document.getElementById('cli-hub-search')?.focus();
    if (this.canViewAll()) this.listUsers();
  },

  closePanel() {
    document.getElementById('cli-hub-bar')?.classList.remove('open');
    const panel = document.getElementById('cli-hub-panel');
    if (panel) panel.classList.remove('deck-active');
    if (GlobeDeck?.activeTask === 'chats') GlobeDeck?.completeTask?.('chats');
  },

  async listUsers() {
    const r = await this.api({ action: 'users' });
    const box = document.getElementById('cli-hub-results');
    if (!box) return;
    if (!r.ok) {
      box.innerHTML = '<div class="ch-empty">' + this.esc(r.error || 'login required') + '</div>';
      return;
    }
    const head = this.canViewAll()
      ? '<div class="ch-head">◎ All users · cloud CLI' + (r.owner ? ' · owner view' : '') + '</div>'
      : '<div class="ch-head">◎ Players on field</div>';
    box.innerHTML = head + (r.users || []).map((u) => {
      const last = u.last_cli?.line ? u.last_cli.line.slice(0, 72) : '—';
      return '<button type="button" class="ch-row" data-ch-action="view" data-ch-user="' + this.esc(u.id) + '">'
        + '<span class="ch-name">' + this.esc(u.emoji) + ' ' + this.esc(u.name) + (u.self ? ' · you' : '') + (u.live ? ' · live' : '') + '</span>'
        + '<span class="ch-sub">' + this.esc(last) + '</span>'
        + '<span class="ch-actions">'
        + '<span class="ch-link" data-ch-action="dm" data-ch-user="' + this.esc(u.id) + '">cloud dm</span>'
        + '</span></button>';
    }).join('') || '<div class="ch-empty">No live users — invite sign-in</div>';
    this.openPanel();
  },

  async runSearch(q) {
    q = String(q || '').trim();
    if (q.length < 2) {
      ACIControl?.reply('Search: 2+ chars — users · chats · CLI lines');
      return;
    }
    const r = await this.api({ action: 'search', q });
    const box = document.getElementById('cli-hub-results');
    if (!box) return;
    if (!r.ok) {
      box.innerHTML = '<div class="ch-empty">' + this.esc(r.error) + '</div>';
      this.openPanel();
      return;
    }
    let html = '<div class="ch-head">Search · «' + this.esc(q) + '»</div>';
    if (r.users?.length) {
      html += '<div class="ch-section">Users</div>';
      html += r.users.map((u) =>
        '<button type="button" class="ch-row" data-ch-action="view" data-ch-user="' + this.esc(u.id) + '">'
        + '<span class="ch-name">' + this.esc(u.emoji) + ' ' + this.esc(u.name) + '</span>'
        + '<span class="ch-link" data-ch-action="dm" data-ch-user="' + this.esc(u.id) + '">cloud dm →</span></button>'
      ).join('');
    }
    if (r.chats?.length) {
      html += '<div class="ch-section">Conversations</div>';
      html += r.chats.slice(0, 12).map((c) =>
        '<button type="button" class="ch-row" data-ch-action="chat" data-ch-circle="' + this.esc(c.circle_id) + '">'
        + '<span class="ch-name">' + this.esc(c.author || '?') + '</span>'
        + '<span class="ch-sub">' + this.esc(c.text?.slice(0, 80)) + '</span></button>'
      ).join('');
    }
    if (r.cli_lines?.length) {
      html += '<div class="ch-section">CLI lines</div>';
      html += r.cli_lines.slice(0, 10).map((l) =>
        '<div class="ch-line deck-' + this.esc(l.cls || 'out') + '">'
        + '<button type="button" class="ch-mini" data-ch-action="view" data-ch-user="' + this.esc(l.user_id) + '">view</button> '
        + this.esc(l.line?.slice(0, 120)) + '</div>'
      ).join('');
    }
    if (!r.users?.length && !r.chats?.length && !r.cli_lines?.length) {
      html += '<div class="ch-empty">No matches</div>';
    }
    box.innerHTML = html;
    this.openPanel();
    AciCli?.print?.('search · ' + q + ' · ' + (r.users?.length || 0) + ' users', 'dim');
  },

  async viewUser(userId) {
    if (!userId) return;
    const owner = this.canViewAll();
    if (userId !== Auth?.user?.id && !owner) {
      ACIControl?.reply('Owner only — or view your own CLI');
      return;
    }
    const r = await this.api({ action: 'feed', user_id: userId, limit: 50 });
    if (!r.ok) {
      AciCli?.print('view failed · ' + (r.error || '?'), 'err');
      return;
    }
    this._viewUserId = userId;
    const name = r.user?.display_name || String(userId).slice(0, 8);
    GlobeDeck?.clearLog?.();
    GlobeDeck?.expand('CLI · ' + name + (r.owner_view ? ' · owner' : ''));
    AciCli?.print('── Cloud CLI · ' + name + ' ──', 'dim');
    (r.lines || []).forEach((row) => {
      GlobeDeck?.log?.(row.line, row.cls || 'out');
    });
    if (!(r.lines || []).length) AciCli?.print('(no cloud lines yet)', 'dim');
    CliRibbon?.setActive?.('CLI · ' + name);
  },

  async startPrivateCloud(targetRef) {
    if (!Auth?.user) {
      Auth?.openLoginModal?.('Sign in for CLI hub');
      return;
    }
    let targetId = String(targetRef || '');
    if (!targetId.match(/^[0-9a-f-]{36}$/i)) {
      const q = targetRef.toLowerCase();
      const hit = (window.others || []).find((u) => (u.name || '').toLowerCase().includes(q))
        || [...(window.MapComms?.members?.values() || [])].find((u) => (u.name || '').toLowerCase().includes(q));
      if (hit?.id) targetId = hit.id;
      else {
        const sr = await this.api({ action: 'search', q: targetRef });
        if (sr.users?.[0]?.id) targetId = sr.users[0].id;
      }
    }
    if (!targetId) {
      ACIControl?.reply('User not found — search name in CLI hub');
      return;
    }
    const r = await this.api({ action: 'open_dm', target_user_id: targetId });
    if (!r.ok) {
      AciCli?.print('dm failed · ' + (r.error || '?'), 'err');
      return;
    }
    const target = {
      id: r.target.id,
      name: r.target.display_name || 'User',
      lat: r.target.field_lat,
      lng: r.target.field_lng,
      emoji: r.target.avatar_emoji || '👤',
    };
    const msgs = (r.messages || []).map((m) => ({
      author: m.author || '?',
      body: m.text,
      t: m.ts || Date.now(),
      author_id: m.author_id,
    }));
    await window.MapComms?.openPrivateCloud?.({
      circleId: r.circle_id,
      target,
      messages: msgs,
    });
    AciCli?.print('◎ Private cloud · ' + target.name + ' · mapdm open', 'ok');
    ACIControl?.reply('Cloud DM with ' + target.name + ' — type in cloud or: chat ' + target.name + ' <message>');
  },

  async cmd(parts) {
    const sub = (parts[1] || 'help').toLowerCase();
    const rest = parts.slice(2).join(' ').trim();
    if (sub === 'search' && rest) return this.runSearch(rest);
    if (sub === 'users' || sub === 'list') return this.listUsers();
    if (sub === 'view' && rest) {
      const q = rest.toLowerCase();
      if (q === 'me' || q === 'self') return this.viewUser(Auth.user.id);
      const sr = await this.api({ action: 'search', q: rest });
      const uid = sr.users?.[0]?.id;
      if (uid) return this.viewUser(uid);
      AciCli?.print('no user · ' + rest, 'err');
      return;
    }
    if (sub === 'dm' && rest) return this.startPrivateCloud(rest);
    if (sub === 'open') { this.openPanel(); return; }
    AciCli?.print([
      'cli search <text> — users · chats · CLI lines',
      'cli users — live roster' + (this.canViewAll() ? ' (owner: all CLIs)' : ''),
      'cli view <name> — cloud transcript',
      'cli dm <name> — private cloud conversation',
      'cloud dm <name> — same',
    ].join('\n'), 'ok');
  },

  _subscribe() {
    if (!Auth?.client || this._rtChannel) return;
    if (!this.canViewAll()) return;
    this._rtChannel = Auth.client.channel('cli-hub-owner');
    this._rtChannel.on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'cli_transcripts',
    }, ({ new: row }) => {
      if (!row || row.user_id === Auth?.user?.id) return;
      if (this._viewUserId === row.user_id) {
        GlobeDeck?.log?.(row.line, row.cls || 'out');
      }
    });
    this._rtChannel.subscribe();
  },
};

window.CliHub = CliHub;
