// === AI ROUTER — OpenAI Mini / Astranov Cycle / Groq / Gemini (shared with coder labs)
const AiRouter = {
  PROVIDERS: [
    { id: 'grok', label: 'Grok', short: 'GK' },
    { id: 'astranov', label: 'Cycle', short: 'AV' },
    { id: 'openai-mini', label: 'OpenAI', short: 'AI' },
    { id: 'groq', label: 'Groq', short: 'GQ' },
    { id: 'gemini', label: 'Gemini', short: 'GM' },
    { id: 'deepseek', label: 'DeepSeek', short: 'DS' },
  ],
  LAB_ENGINES: {
    main: 'grok',
    chatgpt: 'openai-mini',
    grok: 'astranov',
    gemini: 'gemini',
    deepseek: 'deepseek',
    claude: 'astranov',
    composer: 'astranov',
  },
  _provider: 'grok',
  _sessionId: null,

  init() {
    try {
      const saved = localStorage.getItem('astranov:ai-provider');
      // Default Grok (xAI) — only honor saved if still valid
      if (saved && this.PROVIDERS.some(p => p.id === saved)) this._provider = saved;
      else this._provider = 'grok';
    } catch (_) {
      this._provider = 'grok';
    }
    this._sessionId = this._loadSession();
    this._bindUi();
    this._syncUi();
  },

  _loadSession() {
    try {
      return localStorage.getItem('astranov:ai-session') || (window.crypto?.randomUUID?.() || 's-' + Date.now());
    } catch (_) {
      return 's-' + Date.now();
    }
  },

  _saveSession() {
    try { localStorage.setItem('astranov:ai-session', this._sessionId); } catch (_) {}
  },

  current() {
    return this.PROVIDERS.find(p => p.id === this._provider) || this.PROVIDERS[0];
  },

  setProvider(id) {
    if (!this.PROVIDERS.some(p => p.id === id)) return false;
    this._provider = id;
    try { localStorage.setItem('astranov:ai-provider', id); } catch (_) {}
    this._syncUi();
    CliRibbon?.render?.();
    return true;
  },

  cycle() {
    const i = this.PROVIDERS.findIndex(p => p.id === this._provider);
    const next = this.PROVIDERS[(i + 1) % this.PROVIDERS.length];
    this.setProvider(next.id);
    AciCli?.print('AI provider → ' + next.label + ' (' + next.id + ')', 'ok');
    LabOrbs?._syncGlyphs?.();
    return next;
  },

  forLab(lab) {
    const id = lab?.engine || lab?.id;
    return this.LAB_ENGINES[id] || (this.PROVIDERS.some(p => p.id === id) ? id : 'astranov');
  },

  applyLab(lab) {
    const prov = this.forLab(lab);
    this.setProvider(prov);
    return this.current();
  },

  _bindUi() {
    document.getElementById('aci-provider')?.addEventListener('click', () => this.cycle());
  },

  _syncUi() {
    const btn = document.getElementById('aci-provider');
    const p = this.current();
    if (btn) {
      btn.title = 'AI provider: ' + p.label + ' — tap to cycle';
      btn.textContent = p.short;
      btn.dataset.provider = p.id;
    }
  },

  async ask(prompt, opts) {
    opts = opts || {};
    const text = String(prompt || '').trim();
    if (!text) return { error: 'empty prompt' };
    const headers = { 'Content-Type': 'application/json', apikey: SB_KEY };
    if (Auth?.ensureSession) {
      const session = await Auth.ensureSession();
      headers.Authorization = session?.access_token ? 'Bearer ' + session.access_token : 'Bearer ' + SB_KEY;
    } else {
      headers.Authorization = 'Bearer ' + SB_KEY;
    }
    const history = (opts.history || []).slice(-8).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || m.text || m.reply || '').slice(0, 2000),
    }));
    // Free providers first; server may paid-fallback XAI for architect only after limit
    let preferred = opts.provider || this._provider || 'groq';
    if (preferred === 'xai') preferred = 'grok'; // still free-first on server
    const body = {
      text,
      prompt: text,
      level: 'global',
      preferred_provider: preferred,
      session_id: this._sessionId,
      source: 'astranov.eu-main',
      messages: history,
    };
    const timeout = opts.timeoutMs || 25000;
    try {
      const j = await fetchJson(SB_URL + '/functions/v1/ai-router', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }, timeout);
      if (j.error && !j.text && !j.response) return { error: j.error, raw: j };
      // Surface paid-fallback notify to architect UI
      if (j.paid_fallback || j.notify) {
        const note = String(j.paid_notice || j.notify || '⚠ Free limit — paid XAI_API_KEY');
        AciCli?.print?.(note, 'err');
        ACIControl?.reply?.(note);
        CliRibbon?.setNotice?.(note.slice(0, 120), 'err');
      }
      return {
        text: String(j.text || j.response || j.message || '').trim(),
        provider: j.provider || j.via || body.preferred_provider,
        via: j.via || '',
        paid_fallback: !!j.paid_fallback,
        paid_notice: j.paid_notice || j.notify || '',
        model: j.model || '',
        action: j.action || null,
        raw: j,
      };
    } catch (e) {
      return { error: String(e.message || e) };
    }
  },

  shouldRoute(message, opts) {
    if (opts?.forceAci) return false;
    if (AciCoders?.isBuildTask?.(message)) return false;
    if (AciCoders?.wantsComposer?.(message)) return false;
    if (/^coders\s+poll|^summon\s+coders?/i.test(message)) return false;
    return true;
  },
};

window.AiRouter = AiRouter;
