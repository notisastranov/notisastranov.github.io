// === ASTRANOV THEME — follows device dark/bright (prefers-color-scheme) by default; override via CLI ===
// less buttons: no visible toggle; use CLI 'theme auto|dark|bright'
const AstranovTheme = {
  mode: 'dark',
  KEY: 'astranov_theme_v1',
  _maps: [],
  _auto: true,

  init() {
    try {
      const saved = localStorage.getItem(this.KEY);
      if (saved === 'bright' || saved === 'dark') {
        this.mode = saved;
        this._auto = false;
      } else {
        this._auto = true;
        this.mode = this._getSystem();
      }
    } catch (_) {}
    this.apply();
    // no button onclick — removed for less UI clutter; CLI only
    const btn = document.getElementById('aci-theme');
    if (btn) {
      btn.style.display = 'none'; // hidden since auto + CLI
      btn.onclick = null;
    }
    // follow device
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', () => {
        if (this._auto) {
          this.mode = this._getSystem();
          this.apply();
        }
      });
    } catch (_) {}
  },

  _getSystem() {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'bright';
    } catch (_) { return 'dark'; }
  },

  registerMap(mapApi) {
    if (mapApi && !this._maps.includes(mapApi)) this._maps.push(mapApi);
  },

  toggle() {
    if (this._auto) this.set('dark');
    else this.set(this.mode === 'dark' ? 'bright' : 'dark');
  },

  set(mode) {
    if (mode === 'auto' || mode === 'system') {
      this._auto = true;
      this.mode = this._getSystem();
      try { localStorage.removeItem(this.KEY); } catch (_) {}
    } else {
      const next = mode === 'bright' ? 'bright' : 'dark';
      if (next === this.mode && !this._auto) return this.mode;
      this.mode = next;
      this._auto = false;
      try { localStorage.setItem(this.KEY, next); } catch (_) {}
    }
    this.apply();
    AciCli?.print?.('theme → ' + (this._auto ? 'auto (' + this.mode + ')' : this.mode), 'ok');
    GlobeDeck?.setPreview?.((this.mode === 'bright' ? '☀️' : '🌙') + ' ' + (this._auto ? 'auto' : this.mode) + ' theme');
    if (Voice?.maySpeak?.()) speak('Theme ' + (this._auto ? 'auto' : this.mode) + '.', () => resumeListening?.());
    return this.mode;
  },

  apply() {
    const effective = this._auto ? this._getSystem() : this.mode;
    document.documentElement.dataset.theme = effective;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = effective === 'bright' ? '#c8e4ff' : '#00b4ff';
    if (scene?.background) {
      scene.background = new THREE.Color(effective === 'bright' ? 0xc8dff0 : 0x000000);
    }
    if (renderer) renderer.setClearColor(effective === 'bright' ? 0xc8dff0 : 0x000000, 1);
    EarthRealism?.onThemeChange?.();
    this._maps.forEach(m => m.onThemeChange?.());
    // no btn sync needed
  },
};
window.AstranovTheme = AstranovTheme;
