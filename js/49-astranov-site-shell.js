// === ASTRANOV SITE SHELL — subdomains open over the globe (Earth browser) ===
const AstranovSiteShell = {
  active: null,

  init() {
    document.getElementById('as-shell-close')?.addEventListener('click', () => this.close());
    document.getElementById('as-shell-external')?.addEventListener('click', () => {
      if (this.active?.url) window.open(this.active.url, '_blank', 'noopener');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.active) this.close();
    });
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'astranov-match-field-request') {
        AciCoders?.observeActivity?.('field_request', JSON.stringify(e.data.spec || {}).slice(0, 80), e.data);
        ACIControl?.reply('Field request from site — Coders notified');
        void AciCli?.api?.({ mode: 'coders_chat', message: 'Develop booking field for site ' + e.data.siteId + ': ' + JSON.stringify(e.data.spec), fast: false });
      }
    });
  },

  shellUrl(url) {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('shell', '1');
    u.searchParams.set('embed', '1');
    return u.toString();
  },

  open(url, meta = {}) {
    const shell = document.getElementById('astranov-site-shell');
    const frame = document.getElementById('as-shell-frame');
    const domainEl = document.getElementById('as-shell-domain');
    if (!shell || !frame) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    const full = url.startsWith('http') ? url : 'https://' + url;
    this.active = { url: full, ...meta };
    if (domainEl) domainEl.textContent = meta.domain || meta.title || new URL(full).hostname;
    frame.src = this.shellUrl(full);
    shell.classList.add('open');
    document.body.classList.add('site-shell-open');
    if (window.AIGraphics?.setSiteShellMode) AIGraphics.setSiteShellMode(true);
    GlobeDeck?.collapse?.();
    GlobeDeck?.setPreview?.('◎ ' + (meta.domain || full));
    AppShortcuts?.rememberSite?.({ url: full, ...meta });
    AppShortcuts?.track?.('site', meta.domain || meta.title || new URL(full).hostname);
    AciCli?.print?.('site shell · ' + (meta.domain || full), 'ok');
    setTimeout(() => Auth?.broadcastToShell?.(), 1200);
  },

  close() {
    const shell = document.getElementById('astranov-site-shell');
    const frame = document.getElementById('as-shell-frame');
    if (shell) shell.classList.remove('open');
    document.body.classList.remove('site-shell-open');
    if (frame) frame.src = 'about:blank';
    this.active = null;
    AppShortcuts?.untrack?.('site');
    if (window.AIGraphics?.setSiteShellMode) AIGraphics.setSiteShellMode(false);
    GlobeDeck?.setPreview?.('');
  },

  isOpen() { return !!this.active; }
};
window.AstranovSiteShell = AstranovSiteShell;
