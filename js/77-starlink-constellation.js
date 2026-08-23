// === STARLINK — TRUTH MODE ===
// No analytic/fake dots around Earth. Optional live GP only if user forces "starlink live"
// and CelesTrak succeeds; otherwise nothing is drawn.
const StarlinkConstellation = {
  version: '20260718-truth',
  enabled: false,
  maxSats: 0,
  group: null,
  meshes: [],
  _elements: null,
  _built: false,
  _mode: 'off',

  init() {
    if (this._inited) return;
    this._inited = true;
    window.StarlinkConstellation = this;
    this.enabled = false;
    this._clearMeshes();
    console.log('%c[Starlink] truth · no fake constellation dots', 'color:#66aaff');
  },

  ensureBuilt() {
    // Never build analytic shells
    this._clearMeshes();
  },

  _clearMeshes() {
    if (this.group && this.group.parent) {
      try { this.group.parent.remove(this.group); } catch (_) {}
    }
    this.group = null;
    this.meshes = [];
    this._elements = null;
    this._built = false;
    this._mode = 'off';
  },

  async refresh() {
    return [];
  },

  update() {
    // no-op — never paint fake sats
    if (this.group) this.group.visible = false;
  },

  status() {
    return { version: this.version, mode: 'off', count: 0, truth: true };
  },

  wants(text) {
    return /starlink|constellation|leo\s*sat/i.test(String(text || ''));
  },

  async handleCli(line) {
    this.init();
    this._clearMeshes();
    this.enabled = false;
    AciCli?.print?.('No fake satellites · ISS only when live · no toy LEO dots', 'ok');
    return 'Starlink fake dots disabled (truth mode)';
  },
};
window.StarlinkConstellation = StarlinkConstellation;
