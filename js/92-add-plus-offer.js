/**
 * SPECS: no permanent + button.
 * Primary add = long-press anywhere (MultiTile).
 * Only if user tries to add and it fails → offer + on CLI bar.
 */
(function AddPlusOffer() {
  'use strict';
  if (window.__ADD_PLUS_OFFER__?.version === '20260723310000') return;
  window.__ADD_PLUS_OFFER__ = { version: '20260723310000', offered: false, fails: 0 };

  const ADD_INTENT = /\b(add|create|post|pin|place|new\s+(place|pin|stop|tile|shop|vendor)|open\s*tile|multi\s*tile|\+|plus)\b/i;

  function fab() { return document.getElementById('super-add-fab'); }

  function hidePlus(opts) {
    const f = fab();
    if (!f) return;
    window.__ADD_PLUS_OFFER__.offered = false;
    f.hidden = true;
    f.setAttribute('aria-hidden', 'true');
    f.classList.remove('offer-plus', 'plus-pulse');
    f.style.display = 'none';
    document.body.classList.remove('cli-offer-plus');
    if (opts?.quiet) return;
  }

  function offerPlus(reason) {
    const f = fab();
    if (!f) return;
    window.__ADD_PLUS_OFFER__.offered = true;
    window.__ADD_PLUS_OFFER__.fails = (window.__ADD_PLUS_OFFER__.fails || 0) + 1;
    f.hidden = false;
    f.removeAttribute('aria-hidden');
    f.classList.add('offer-plus', 'plus-pulse');
    f.style.display = 'inline-flex';
    f.title = 'Add place (long-press failed — tap +)';
    document.body.classList.add('cli-offer-plus');
    // Ensure on CLI edge bar (before Send / headset)
    try {
      const edge = document.getElementById('super-cli-edge-right');
      const send = document.getElementById('globe-deck-send');
      if (edge && f.parentElement !== edge) edge.insertBefore(f, send || null);
      else if (edge && send && f.nextElementSibling !== send) edge.insertBefore(f, send);
    } catch (_) {}
    try {
      GlobeDeck?.ensureCliVisible?.('dim');
      AciCli?.print?.(
        '◆ add failed' + (reason ? ' · ' + String(reason).slice(0, 80) : '') + ' — long-press map/globe, or tap + on the bar',
        'warn'
      );
      CliRibbon?.setNotice?.('tap + to add', 'hold');
    } catch (_) {}
    // Stop pulse after a few seconds so it doesn't annoy
    setTimeout(() => { try { f.classList.remove('plus-pulse'); } catch (_) {} }, 6000);
  }

  function noteAddSuccess() {
    // Successful MultiTile open — hide rescue + again (long-press is the path)
    hidePlus({ quiet: true });
  }

  function noteAddFail(reason) {
    offerPlus(reason || 'could not open tile');
  }

  window.AstranovAddOffer = {
    offerPlus,
    hidePlus,
    noteAddFail,
    noteAddSuccess,
    isOffered: () => !!window.__ADD_PLUS_OFFER__.offered,
  };

  function ensureCss() {
    if (document.getElementById('add-plus-offer-css')) return;
    const s = document.createElement('style');
    s.id = 'add-plus-offer-css';
    s.textContent = `
/* Default: no + button. Only when body.cli-offer-plus after failed add */
#super-add-fab,
#super-cli-bar #super-add-fab{
  display:none!important;
  visibility:hidden!important;
  pointer-events:none!important;
  width:0!important;height:0!important;margin:0!important;padding:0!important;
  border:0!important;overflow:hidden!important;
}
body.cli-offer-plus #super-add-fab,
body.cli-offer-plus #super-cli-bar #super-add-fab,
#super-add-fab.offer-plus{
  display:inline-flex!important;
  visibility:visible!important;
  pointer-events:auto!important;
  width:30px!important;height:30px!important;
  margin:0!important;padding:0!important;
  border:1px solid rgba(122,162,247,.65)!important;
  border-radius:8px!important;
  background:rgba(26,80,160,.55)!important;
  color:#f0f8ff!important;
  font:700 16px/1 system-ui,sans-serif!important;
  box-shadow:0 0 14px rgba(61,158,255,.5)!important;
  align-items:center;justify-content:center;
  flex-shrink:0;
}
#super-add-fab.plus-pulse{
  animation:plus-offer-pulse 1.1s ease-in-out 4;
}
@keyframes plus-offer-pulse{
  0%,100%{ box-shadow:0 0 10px rgba(61,158,255,.4); transform:scale(1); }
  50%{ box-shadow:0 0 22px rgba(61,158,255,.85); transform:scale(1.06); }
}
`;
    document.head.appendChild(s);
  }

  /** SuperCli always forced + visible — stop that */
  function patchSuperCli() {
    const S = window.SuperCli;
    if (!S) return;
    if (Array.isArray(S.TOOLBAR_VISIBLE)) {
      S.TOOLBAR_VISIBLE = S.TOOLBAR_VISIBLE.filter((id) => id !== 'super-add-fab');
    }
    if (S.__plusPatched) return;
    S.__plusPatched = true;
    const _set = S.setContext?.bind(S);
    S.setContext = function (ctx) {
      const r = _set ? _set(ctx) : undefined;
      // After SuperCli forces buttons, re-apply plus policy
      const f = fab();
      if (!f) return r;
      if (window.__ADD_PLUS_OFFER__.offered) {
        f.hidden = false;
        f.classList.add('offer-plus');
        f.style.display = 'inline-flex';
        document.body.classList.add('cli-offer-plus');
      } else {
        hidePlus({ quiet: true });
      }
      return r;
    };
    // Toolbar click still works when offered
    const actions = S.bindToolbar;
    // rebind plus click if SuperCli maps it
  }

  function patchMultiTile() {
    const wrap = (name) => {
      const M = window.MultiTile;
      if (!M || typeof M[name] !== 'function' || M[name].__plusWrapped) return;
      const orig = M[name].bind(M);
      const wrapped = function () {
        try {
          const ret = orig.apply(this, arguments);
          // async?
          if (ret && typeof ret.then === 'function') {
            return ret.then((v) => {
              try {
                if (M._open) noteAddSuccess();
                else noteAddFail(name + ' did not open');
              } catch (_) {}
              return v;
            }).catch((e) => {
              noteAddFail(e?.message || name + ' error');
              throw e;
            });
          }
          // sync: check shortly if tile opened
          setTimeout(() => {
            try {
              if (M._open) noteAddSuccess();
              else if (name === 'openAt' || name === 'openFromPlus' || name === 'openUser') {
                // openAt may set _open async after geocode — give it a moment
                setTimeout(() => {
                  if (M._open) noteAddSuccess();
                  else noteAddFail(name + ' failed');
                }, 900);
              }
            } catch (e) {
              noteAddFail(e?.message || 'add failed');
            }
          }, 120);
          return ret;
        } catch (e) {
          noteAddFail(e?.message || name + ' threw');
          throw e;
        }
      };
      wrapped.__plusWrapped = true;
      M[name] = wrapped;
    };
    wrap('openAt');
    wrap('openFromPlus');
    wrap('openUser');
  }

  function patchLongPress() {
    if (typeof window.openMultiTileAtPoint !== 'function') return;
    if (window.openMultiTileAtPoint.__plusWrapped) return;
    const orig = window.openMultiTileAtPoint;
    window.openMultiTileAtPoint = function (clientX, clientY, source) {
      try {
        const r = orig.apply(this, arguments);
        // If MultiTile missing, original may load async — watch
        setTimeout(() => {
          if (!window.MultiTile) {
            noteAddFail('MultiTile not loaded');
            return;
          }
          setTimeout(() => {
            if (!MultiTile._open) noteAddFail('long-press add failed');
            else noteAddSuccess();
          }, 1000);
        }, 400);
        return r;
      } catch (e) {
        noteAddFail(e?.message || 'long-press error');
        throw e;
      }
    };
    window.openMultiTileAtPoint.__plusWrapped = true;
  }

  /** CLI freeform "add place" etc. that don't open tile → offer + */
  function patchCliAddIntent() {
    const C = window.AciCli;
    if (!C?.run || C.run.__plusAddPatched) return;
    const _run = C.run.bind(C);
    C.run = async function (line, opts) {
      const raw = String(line || '').trim();
      const wantsAdd = ADD_INTENT.test(raw) && !/^(help|\/help)/i.test(raw);
      const before = !!(window.MultiTile && MultiTile._open);
      const ret = await _run(raw, opts);
      if (wantsAdd) {
        setTimeout(() => {
          const open = !!(window.MultiTile && MultiTile._open);
          if (!open && !before) {
            noteAddFail('could not add from text — long-press a point, or use +');
          } else if (open) noteAddSuccess();
        }, 1200);
      }
      return ret;
    };
    C.run.__plusAddPatched = true;
  }

  function bindFabSuccess() {
    const f = fab();
    if (!f || f._offerBound) return;
    f._offerBound = true;
    f.addEventListener('click', () => {
      // After user uses rescue +, hide again once tile opens
      setTimeout(() => {
        if (window.MultiTile?._open) noteAddSuccess();
      }, 800);
    }, true);
  }

  function apply() {
    ensureCss();
    hidePlus({ quiet: true });
    patchSuperCli();
    patchMultiTile();
    patchLongPress();
    patchCliAddIntent();
    bindFabSuccess();
    try { SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle'); } catch (_) {}
  }

  apply();
  setTimeout(apply, 400);
  setTimeout(apply, 1500);
  setTimeout(apply, 4000);
})();
