// === CODERS HUB — multi-team race board + cross-lab handoff
const CodersHub = {
  CONTINUATION_KEY: 'astranov:job-continuation',
  REGISTRY_URL: '/coders-labs.json',
  LABS: [
    { id: 'main', label: 'Globe OS', glyph: '◈', url: 'https://astranov.eu', accent: '#7eb8ff', team: 'Astranov', provider: 'Grok Build', engine: 'grok' },
    { id: 'grok', label: 'Grok', glyph: 'GK', url: 'https://grok.astranov.eu', accent: '#e8e8e8', team: 'xAI', provider: 'Grok', engine: 'grok' },
    { id: 'chatgpt', label: 'ChatGPT', glyph: 'CG', url: 'https://chatgpt.astranov.eu', accent: '#74c0fc', team: 'OpenAI', provider: 'GPT-4o mini', engine: 'openai-mini' },
    { id: 'claude', label: 'Claude', glyph: 'CL', url: 'https://claude.astranov.eu', accent: '#d4a574', team: 'Anthropic', provider: 'Claude', engine: 'claude' },
    { id: 'composer', label: 'Composer', glyph: 'CP', url: 'https://composer.astranov.eu', accent: '#a8c8ff', team: 'Cursor', provider: 'Composer', engine: 'composer' },
    { id: 'gemini', label: 'Gemini', glyph: 'GM', url: 'https://gemini.astranov.eu', accent: '#8ab4f8', team: 'Google', provider: 'Gemini', engine: 'gemini' },
    { id: 'deepseek', label: 'DeepSeek', glyph: 'DS', url: 'https://deepseek.astranov.eu', accent: '#5eead4', team: 'DeepSeek', provider: 'DeepSeek', engine: 'deepseek' },
    { id: 'cursor', label: 'Cursor', glyph: 'CR', url: 'https://cursor.astranov.eu', accent: '#c8d8ff', team: 'Cursor', provider: 'Cursor IDE', engine: 'cursor', comingSoon: true },
  ],
  _open: false,
  _status: {},
  _pinging: false,

  async init() {
    this._bind();
    await this._loadRegistry();
    this.renderLabs();
    this.refreshJob();
    this._updateRaceBoard();
    this._maybeResumeFromQuery();
    if (SlumberManager?.allows?.('coders_ping')) this._pingLabs();
  },

  _bind() {
    document.getElementById('coders-hub-trigger')?.addEventListener('click', () => this.toggle(true));
    document.getElementById('coders-hub-close')?.addEventListener('click', () => this.toggle(false));
    document.getElementById('coders-save-job')?.addEventListener('click', () => this.saveJob());
    document.getElementById('coders-resume-job')?.addEventListener('click', () => this.resumeJob());
    document.getElementById('coders-clear-job')?.addEventListener('click', () => this.clearJob());
    document.getElementById('coders-summon-composer')?.addEventListener('click', () => this.summonComposer());
    document.getElementById('coders-refresh-labs')?.addEventListener('click', () => {
      SlumberManager?.wake?.('coders_ping', 'refresh');
      if (SlumberManager?.allows?.('coders_ping')) this._pingLabs();
      this.renderLabs();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._open) this.toggle(false);
    });
  },

  async _loadRegistry() {
    try {
      const r = await fetch(this.REGISTRY_URL, { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      if (Array.isArray(data?.labs) && data.labs.length) {
        this.LABS = data.labs;
        if (data.continuationKey) this.CONTINUATION_KEY = data.continuationKey;
      }
    } catch (_) {}
  },

  toggle(open) {
    const panel = document.getElementById('coders-hub-panel');
    if (!panel) return;
    this._open = open !== false ? !this._open : false;
    panel.classList.toggle('open', this._open);
    panel.setAttribute('aria-hidden', this._open ? 'false' : 'true');
    if (this._open) {
      this.renderLabs();
      this.refreshJob();
      this._updateRaceBoard();
      if (SlumberManager?.allows?.('coders_ping')) this._pingLabs();
    }
  },

  readJob() {
    try {
      const raw = localStorage.getItem(this.CONTINUATION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  },

  writeJob(payload) {
    try {
      localStorage.setItem(this.CONTINUATION_KEY, JSON.stringify(payload));
    } catch (_) {}
    this.refreshJob();
    this._updateRaceBoard();
  },

  buildJob() {
    const hist = AciCoders?.history || [];
    const lastUser = [...hist].reverse().find((m) => m.role === 'user' || m.from === 'user');
    const lastBot = [...hist].reverse().find((m) => m.role === 'assistant' || m.from === 'assistant' || m.reply);
    const cliLines = AciCli?._lines || [];
    const lastCli = cliLines.slice(-6).map((l) => l.text || l).join('\n').slice(0, 600);
    return {
      updatedAt: new Date().toISOString(),
      fromLab: 'main',
      summary: (lastBot?.reply || lastBot?.content || lastBot?.text || lastCli || 'Globe OS thread').slice(0, 280),
      lastPrompt: (lastUser?.text || lastUser?.content || lastUser?.message || '').slice(0, 400),
      messages: hist.slice(-8).map((m) => ({
        role: m.role || (m.from === 'user' ? 'user' : 'assistant'),
        content: m.text || m.content || m.reply || m.message || '',
      })),
      engine: AciCoders?.engine || 'grok',
    };
  },

  refreshJob() {
    const job = this.readJob();
    const meta = document.getElementById('coders-job-meta');
    const preview = document.getElementById('coders-job-preview');
    if (!meta || !preview) return;
    if (!job) {
      meta.textContent = 'No saved job';
      preview.textContent = 'Save your CLI thread to hand off to any AI coder team.';
      return;
    }
    const when = job.updatedAt ? new Date(job.updatedAt).toLocaleString() : 'unknown';
    meta.textContent = `${job.fromLab || 'lab'} · ${when}`;
    preview.textContent = job.summary || job.lastPrompt || 'Saved continuation pack.';
  },

  saveJob() {
    const job = this.buildJob();
    this.writeJob(job);
    ACIControl?.reply('Job saved — any coder team can pick it up from their lab.');
    AciCli?.print('Coders race · job saved for cross-team handoff', 'ok');
    this.refreshJob();
  },

  resumeJob() {
    const job = this.readJob();
    if (!job) {
      ACIControl?.reply('No saved job yet. Talk to Coders first, then Save.');
      return;
    }
    const input = document.getElementById('aci-cli-in');
    if (input && job.lastPrompt) {
      input.value = `Continue from ${job.fromLab || 'previous lab'}: ${job.lastPrompt}`;
      input.dispatchEvent(new Event('input'));
    }
    GlobeDeck?.expand?.('Coders — resumed job');
    ACIControl?.reply(`Resumed job from ${job.fromLab || 'another team'}. Send when ready.`);
    if (job.lastPrompt) void AciCoders?.handleMessage?.(job.lastPrompt);
    this.toggle(false);
  },

  clearJob() {
    try { localStorage.removeItem(this.CONTINUATION_KEY); } catch (_) {}
    this.refreshJob();
    this._updateRaceBoard();
    AciCli?.print('Coders hub · job cleared', 'dim');
  },

  _inlineLabs: new Set(['gemini', 'deepseek']),

  canInline(lab) {
    if (!lab || lab.comingSoon || lab.id === 'main') return false;
    if (lab.inlineFallback || this._inlineLabs.has(lab.id)) return true;
    const st = this._status[lab.id];
    return st === 'offline' || st === 'soon' || st === 'slow';
  },

  openLabInline(lab) {
    const job = this.buildJob();
    this.writeJob(job);
    const prov = AiRouter?.applyLab?.(lab);
    GlobeDeck?.expand?.(lab.label + ' · inline on Globe OS');
    const input = document.getElementById('aci-cli-in');
    if (input && job.lastPrompt) {
      input.value = `Continue on ${lab.label}: ${job.lastPrompt}`;
      input.dispatchEvent(new Event('input'));
    }
    ACIControl?.reply(`${lab.label} inline — AI provider → ${prov?.label || lab.provider} (subdomain ${this._status[lab.id] || 'pending'})`);
    AciCli?.print(`${lab.label} lab routed via ai-router · ${prov?.id || lab.engine}`, 'ok');
    this.toggle(false);
    void AciCoders?.enterSession?.({ focus: true });
  },

  openLab(lab) {
    if (!lab?.url || lab.comingSoon) {
      ACIControl?.reply(`${lab?.label || 'Lab'} subdomain not live yet — stay on Globe OS or try ChatGPT/Claude/Grok.`);
      return;
    }
    const st = this._status[lab.id];
    if (st === 'offline' || (this.canInline(lab) && st !== 'live')) {
      if (this.canInline(lab)) return this.openLabInline(lab);
      ACIControl?.reply(`${lab.label} lab is offline right now — try another team or save job for later.`);
      return;
    }
    if (lab.id === 'main') {
      this.toggle(true);
      return;
    }
    this.writeJob(this.buildJob());
    const target = new URL(lab.url);
    target.searchParams.set('continue', '1');
    target.searchParams.set('from', 'main');
    window.location.href = target.toString();
  },

  async summonComposer() {
    const job = this.buildJob();
    this.writeJob(job);
    const task = job.lastPrompt || job.summary || 'Continue Globe OS development';
    if (!Auth?.user) {
      ACIControl?.reply('Sign in with G first — then Summon Composer queues your build.');
      Auth?.openLoginModal?.('Sign in to summon Composer on your job');
      return;
    }
    AciCli?.print('Summoning Composer…', 'dim');
    const q = await AciCoders?.queueCoder?.(task, 'composer');
    if (q?.summon_id) {
      ACIControl?.reply(`Composer queued #${q.summon_id} — polling for answer`);
      AciCli?.print('Composer #' + q.summon_id + ' · say "coders poll" or wait', 'ok');
    } else {
      ACIControl?.reply(q?.text || q?.error || 'Composer queue failed — try again');
    }
    this.toggle(false);
  },

  async _pingLabs() {
    if (!SlumberManager?.allows?.('coders_ping')) return;
    if (this._pinging) return;
    this._pinging = true;
    const badge = document.getElementById('coders-hub-trigger');
    if (badge) badge.dataset.pinging = '1';
    await Promise.all(this.LABS.map(async (lab) => {
      if (lab.comingSoon || lab.id === 'main') {
        this._status[lab.id] = lab.comingSoon ? 'soon' : 'live';
        return;
      }
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(lab.url, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(t);
        this._status[lab.id] = r.type === 'opaque' || r.ok ? 'live' : 'offline';
      } catch (e) {
        this._status[lab.id] = e?.name === 'AbortError' ? 'slow' : 'offline';
      }
    }));
    this._pinging = false;
    if (badge) delete badge.dataset.pinging;
    this._updateTriggerBadge();
    if (this._open) this.renderLabs();
  },

  _liveCount() {
    return this.LABS.filter((l) => this._status[l.id] === 'live' || l.id === 'main').length;
  },

  _updateTriggerBadge() {
    const badge = document.getElementById('coders-hub-live-count');
    const n = this._liveCount();
    if (badge) badge.textContent = String(n);
  },

  _updateRaceBoard() {
    const el = document.getElementById('coders-race-board');
    if (!el) return;
    const job = this.readJob();
    const live = this._liveCount();
    const leader = job?.fromLab ? `Last handoff: ${job.fromLab}` : 'No handoff yet';
    el.textContent = `${live} labs live · ${this.LABS.length} teams racing · ${leader}`;
  },

  _statusLabel(id) {
    const s = this._status[id];
    if (s === 'live') return { text: 'LIVE', cls: 'live' };
    if (s === 'slow') return { text: 'SLOW', cls: 'slow' };
    if (s === 'soon') return { text: 'SOON', cls: 'soon' };
    if (s === 'offline') return { text: 'OFF', cls: 'off' };
    return { text: '…', cls: 'check' };
  },

  renderLabs() {
    const grid = document.getElementById('coders-hub-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const host = (location.hostname || '').replace(/^www\./, '');
    const sorted = [...this.LABS].sort((a, b) => {
      const rank = (id) => {
        const s = this._status[id];
        if (id === 'main') return 0;
        if (s === 'live') return 1;
        if (s === 'slow') return 2;
        if (s === 'soon') return 4;
        return 3;
      };
      return rank(a.id) - rank(b.id);
    });
    for (const lab of sorted) {
      const here = (host === 'astranov.eu' && lab.id === 'main') || host === `${lab.id}.astranov.eu`;
      const st = this._statusLabel(lab.id);
      const card = document.createElement('article');
      card.className = 'coders-card' + (here ? ' is-here' : '') + (st.cls === 'off' ? ' is-off' : '');
      card.style.setProperty('--lab-accent', lab.accent || '#7eb8ff');
      const team = lab.team ? `<span class="coders-team">${this._esc(lab.team)}</span>` : '';
      const provider = lab.provider ? `<span class="coders-provider">${this._esc(lab.provider)}</span>` : '';
      card.innerHTML =
        `<div class="coders-card-top"><span class="coders-card-glyph">${this._esc(lab.glyph)}</span>`
        + `<div><h2>${this._esc(lab.label)}</h2>${team}${here ? '<span class="coders-here">You are here</span>' : ''}</div>`
        + `<span class="coders-status coders-status-${st.cls}">${st.text}</span></div>`
        + `${provider ? `<p class="coders-card-provider">${provider}</p>` : ''}`
        + `<p class="coders-card-path">${this._esc((lab.url || '').replace('https://', ''))}</p>`
        + `<button type="button" class="coders-open" ${lab.comingSoon ? 'disabled' : ''}>${here ? 'Stay in lab' : lab.comingSoon ? 'Coming soon' : st.cls === 'off' && this.canInline(lab) ? 'Open inline' : st.cls === 'off' ? 'Offline' : 'Open lab'}</button>`;
      const btn = card.querySelector('.coders-open');
      if (btn && !btn.disabled) btn.addEventListener('click', () => this.openLab(lab));
      grid.append(card);
    }
    this._updateRaceBoard();
    this._updateTriggerBadge();
  },

  _maybeResumeFromQuery() {
    const params = new URLSearchParams(location.search);
    if (!params.has('continue')) return;
    const job = this.readJob();
    if (!job) return;
    const from = params.get('from');
    if (from) AciCli?.print?.(`Handoff from ${from} lab — resuming job`, 'ok');
    window.setTimeout(() => this.resumeJob(), 700);
    params.delete('continue');
    params.delete('from');
    const clean = `${location.pathname}${params.toString() ? '?' + params : ''}${location.hash}`;
    history.replaceState({}, '', clean);
  },

  _esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  },
};

window.CodersHub = CodersHub;
window.openCodersHub = () => CodersHub.toggle(true);
