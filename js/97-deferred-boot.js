// === DEFERRED BOOT — init subsystems moved out of 99-boot.js ===
const DeferredBoot = {
  _done: false,

  run() {
    if (this._done) return;
    this._done = true;
    window._deferredBootDone = true;
    const sl = window.SlumberManager;
    const go = (id, fn) => { if (!sl || sl.shouldInit(id)) fn?.(); };

    go('celestial', () => window.CelestialNav?.init?.());
    go('globe', () => window.Responsive3D?.init?.());
    go('commerce', () => window.OrderTracking?.init?.());
    go('presence', () => window.AstranovSession?.init?.());
    go('presence', () => window.AstranovPresence?.init?.());
    go('cli', () => window.ProfileSite?.init?.());
    go('coders_ping', () => window.CodersHub?.init?.());

    go('lab_orbs', () => window.LabOrbs?.init?.());
    go('cli', () => window.SuperCli?.initBrain?.());
    go('cli', () => window.SuperAdd?.init?.());
    go('globe', () => window.TelemachosPilot?.init?.());

    if (sl?.allows('commerce')) {
      setTimeout(() => {
        const c = window.Commerce;
        if (c?.loadVendors) {
          c.loadVendors().then(() => c.initUI?.()).catch(() => {});
        }
      }, sl?.tier === 'slumber' ? 1200 : 400);
    }
  },
};
window.DeferredBoot = DeferredBoot;
// Do NOT auto-run on script parse — LazyModules.schedule/ensure calls run().
// Auto-run was freezing phones while the 360KB pack executed commerce+presence init.
