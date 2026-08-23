// === SPARTAN BOOT · FEATURES — field hub only. Heavy toys stay deferred. ===
window.__astranovBootFeatures = function __astranovBootFeatures() {
  const soft = (name, fn) => {
    try { fn?.(); } catch (e) { console.warn('[spartan features] ' + name, e); }
  };
  const idle = (fn, ms) => {
    const run = () => { try { fn(); } catch (e) { console.warn('[spartan idle]', e); } };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: ms });
    else setTimeout(run, Math.min(ms, 800));
  };

  soft('GlobeEntity', () => GlobeEntity?.init?.());
  soft('CityTasks', () => {
    CityTasks?.init?.();
    TaskBoard?.init?.();
  });
  soft('SpaceNetCM', () => SpaceNetCM?.init?.());
  soft('CoreBrain', () => AstranovCoreBrain?.init?.());
  soft('Logo', () => AstranovLogo?.init?.());
  soft('Shortcuts', () => {
    try { AppShortcuts?.init?.(); } catch (_) {}
  });

  // Locate wiring: 🎯 national → city (never bare undeclared locateMe — kills app)
  idle(() => {
    const btn = document.getElementById('aci-locate');
    if (btn && !btn._spartanLocate) {
      btn._spartanLocate = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          if (window.CityLife?.safeLocate) void window.CityLife.safeLocate();
          else if (window.CityLife?.locateAndDropIn) void window.CityLife.locateAndDropIn().catch(() => {});
          else if (typeof window.locateMe === 'function') window.locateMe();
        } catch (err) {
          console.warn('[locate]', err);
        }
      }, { capture: true });
    }
  }, 200);

  if (window._lastPos) {
    try {
      const nm = Auth?.user?.user_metadata?.full_name
        || Auth?.user?.email?.split?.('@')?.[0]
        || 'You';
      GlobeEntity?.syncMe?.(window._lastPos.lat, window._lastPos.lng, nm);
    } catch (_) {}
  }

  if (!window.showFirstRunCoach) {
    window.showFirstRunCoach = function showFirstRunCoach() {
      try { if (localStorage.getItem('astranov:coach-v2')) return; } catch (_) { return; }
      const el = document.getElementById('first-run-coach');
      if (!el) return;
      if (PublicCopy?.coachHtml) {
        el.innerHTML = PublicCopy.coachHtml()
          + '<button type="button" id="first-run-coach-ok">Got it</button>';
      }
      el.hidden = false;
      document.getElementById('first-run-coach-ok')?.addEventListener('click', () => {
        el.hidden = true;
        try { localStorage.setItem('astranov:coach-v2', '1'); } catch (_) {}
      });
    };
  }
  setTimeout(() => {
    try { showFirstRunCoach?.(); } catch (_) {}
  }, 900);

  window._astranovFeaturesReady = true;
  document.documentElement.dataset.astranovPhase = 'features';
  console.log('%c[Spartan] field hub · channels · tasks', 'color:#ffdd44;font-weight:700');
};
