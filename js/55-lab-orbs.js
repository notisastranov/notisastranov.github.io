// === LAB ORBS — ChatGPT-lab affordances on real WebGL globe (no static Earth overlay)
const LabOrbs = {
  ORBS: [
    { id: 'coders', label: 'Coders', glyph: 'CD', color: '#b8d4ff', angle: -68, panel: 'coders' },
    { id: 'locate', label: 'Locate', glyph: '🎯', color: '#54e6ff', angle: -22, panel: 'locate' },
    { id: 'provider', label: 'AI', glyph: 'AV', color: '#6df2bd', angle: 22, panel: 'provider' },
    { id: 'theme', label: 'Theme', glyph: '☀', color: '#ffd166', angle: 68, panel: 'theme' },
    { id: 'hub', label: 'Labs', glyph: '⬡', color: '#8fb7ff', angle: 130, panel: 'hub' },
  ],
  _open: false,
  _bound: false,
  _introDone: false,

  _isMobile() {
    try {
      return (navigator.maxTouchPoints > 0 && window.innerWidth < 900)
        || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    } catch (_) {
      return window.innerWidth < 900;
    }
  },

  init() {
    if (!SlumberManager?.allows?.('lab_orbs')) return;
    if (this._bound) return;
    this._bound = true;
    this._mount();
    this._bind();
    this._layout();
    window.addEventListener('resize', () => this._layout());
    if (!this._isMobile() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.setTimeout(() => this._runIntro(), 1200);
    }
  },

  _mount() {
    if (document.getElementById('lab-orb-layer')) return;
    const layer = document.createElement('div');
    layer.id = 'lab-orb-layer';
    layer.setAttribute('aria-label', 'Quick actions');
    const tray = document.createElement('button');
    tray.id = 'lab-orb-tray';
    tray.type = 'button';
    tray.title = 'Astranov orbs — tap for Coders, Locate, AI provider';
    tray.innerHTML = '<span class="lab-orb-tray-glyph">◈</span><span class="lab-orb-tray-label">Orbs</span>';
    layer.appendChild(tray);
    for (const orb of this.ORBS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lab-orb';
      btn.dataset.orb = orb.id;
      btn.dataset.panel = orb.panel;
      btn.title = orb.label;
      btn.style.setProperty('--orb-color', orb.color);
      btn.innerHTML = `<span class="lab-orb-glyph">${orb.glyph}</span><span class="lab-orb-label">${orb.label}</span>`;
      layer.appendChild(btn);
    }
    document.body.appendChild(layer);
  },

  _bind() {
    document.getElementById('lab-orb-tray')?.addEventListener('click', () => this.toggle());
    document.querySelectorAll('#lab-orb-layer .lab-orb').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._activate(btn.dataset.panel, btn.dataset.orb);
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._open) this.toggle(false);
    });
  },

  toggle(open) {
    const layer = document.getElementById('lab-orb-layer');
    if (!layer) return;
    this._open = open !== false ? !this._open : false;
    layer.classList.toggle('open', this._open);
    if (this._open) this._syncGlyphs();
  },

  _syncGlyphs() {
    const prov = document.querySelector('#lab-orb-layer .lab-orb[data-orb="provider"] .lab-orb-glyph');
    if (prov && window.AiRouter) prov.textContent = AiRouter.current()?.short || 'AV';
    const theme = document.querySelector('#lab-orb-layer .lab-orb[data-orb="theme"] .lab-orb-glyph');
    if (theme) theme.textContent = AstranovTheme?.mode === 'bright' ? '☀' : '🌙';
  },

  _layout() {
    const layer = document.getElementById('lab-orb-layer');
    if (!layer) return;
    const tray = document.getElementById('lab-orb-tray');
    const rect = tray?.getBoundingClientRect();
    const cx = (rect?.left || 48) + (rect?.width || 44) / 2;
    const cy = (rect?.top || window.innerHeight - 120) + (rect?.height || 44) / 2;
    const radius = Math.min(92, window.innerWidth * 0.22);
    layer.querySelectorAll('.lab-orb').forEach((btn, i) => {
      const orb = this.ORBS[i];
      if (!orb) return;
      const rad = (orb.angle * Math.PI) / 180;
      const x = cx + Math.cos(rad) * radius - 22;
      const y = cy + Math.sin(rad) * radius - 22;
      btn.style.left = x + 'px';
      btn.style.top = y + 'px';
    });
  },

  _runIntro() {
    if (this._introDone || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this._introDone = true;
    const layer = document.getElementById('lab-orb-layer');
    if (!layer) return;
    layer.classList.add('intro');
    window.setTimeout(() => {
      layer.classList.add('open');
      this._open = true;
      this._syncGlyphs();
      window.setTimeout(() => {
        layer.classList.remove('open', 'intro');
        this._open = false;
      }, 2400);
    }, 400);
  },

  _activate(panel, orbId) {
    this.toggle(false);
    if (panel === 'coders') {
      GlobeDeck?.expand?.('Coders');
      void AciCoders?.enterSession?.({ focus: true });
      return;
    }
    if (panel === 'locate') {
      locateMe?.();
      return;
    }
    if (panel === 'provider') {
      const next = AiRouter?.cycle?.();
      ACIControl?.reply('AI provider → ' + (next?.label || 'Cycle'));
      this._syncGlyphs();
      return;
    }
    if (panel === 'theme') {
      AstranovTheme?.toggle?.();
      ACIControl?.reply('Theme → ' + (AstranovTheme?.mode || 'dark'));
      this._syncGlyphs();
      return;
    }
    if (panel === 'hub') {
      CodersHub?.toggle?.(true);
      return;
    }
    ACIControl?.reply('Orb · ' + (orbId || panel));
  },
};

window.LabOrbs = LabOrbs;
