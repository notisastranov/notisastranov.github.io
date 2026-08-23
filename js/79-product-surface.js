// === PRODUCT SURFACE — MPP tile · video call · field HUD · continuity contract ===
// Restores shell pieces the assemble path dropped. Safe to run multiple times.
const ProductSurface = {
  version: '20260717-product',

  init() {
    if (this._inited) return;
    this._inited = true;
    try {
      this._injectCss();
      this._ensureCliEdge();
      this._ensureVideoCall();
      this._ensureMppTile();
      this._bootProductModules();
    } catch (e) {
      console.warn('[ProductSurface] init', e);
    }
  },

  _injectCss() {
    if (document.getElementById('product-surface-css')) return;
    const st = document.createElement('style');
    st.id = 'product-surface-css';
    st.textContent = [
      '#super-cli-bar #aci-video-call{display:inline-flex!important;align-items:center;justify-content:center;',
      'width:34px;height:34px;border-radius:50%;border:1px solid var(--ax-blue-border);',
      'background:var(--ax-blue-bg);color:var(--ax-blue-bright);font-size:14px;cursor:pointer;flex-shrink:0}',
      '#super-cli-bar #aci-video-call:active{transform:scale(0.94)}',
      '#super-cli-bar button:not(#aci-login):not(#aci-locate):not(#super-add-fab):not(#aci-handsfree):not(#aci-bridge):not(#aci-video-call):not(.app-shortcut-btn){display:none!important}',
      '#super-cli-bar #aci-locate{display:inline-flex!important;visibility:visible!important;opacity:1!important}',
      '#super-cli-edge-right{display:flex!important;align-items:center;gap:5px;margin-left:auto;flex-shrink:0}',
      '#super-cli-bar #app-shortcut-row{display:none!important}',
      '#menu-profile-post-tile{display:none;position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));',
      'transform:translateX(-50%);z-index:190;width:min(420px,96vw);max-height:min(72vh,640px);overflow:auto;',
      'padding:12px;border-radius:16px;background:rgba(4,12,28,0.94);border:1px solid rgba(61,158,255,0.45);',
      'box-shadow:0 12px 40px rgba(0,0,0,0.55),0 0 20px rgba(26,111,212,0.25);color:var(--an-text,#e8f4ff);',
      'font:12px/1.4 system-ui;backdrop-filter:blur(14px);touch-action:manipulation}',
      '#menu-profile-post-tile.open{display:block}',
      '#menu-profile-post-tile.mpp-pin-pick{border-color:#ffdd44;box-shadow:0 0 18px rgba(255,221,68,0.4)}',
      '.mpp-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
      '.mpp-head b{flex:1;font-size:13px;color:#7ec8ff}',
      '.mpp-head button{background:transparent;border:1px solid #456;color:#abc;border-radius:8px;padding:6px 8px;cursor:pointer}',
      '#mpp-coords{font-size:10px;color:#8ab;margin-bottom:8px}',
      '#mpp-roles{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}',
      '.mpp-role-chip{padding:6px 10px;border-radius:999px;border:1px solid rgba(61,158,255,0.35);background:rgba(0,20,40,0.6);',
      'color:#9cf;font-size:10px;cursor:pointer}',
      '.mpp-role-chip.on{border-color:#00dd77;color:#00ff99;background:rgba(0,221,119,0.12)}',
      '.mpp-section{display:none;margin-top:10px;padding-top:8px;border-top:1px solid rgba(80,120,160,0.25)}',
      '.mpp-section.visible{display:block}',
      '.mpp-section h4{margin:0 0 6px;font-size:11px;color:#7ec8ff}',
      '.mpp-act,.mpp-vendor,#mpp-apply,#mpp-post-now,#mpp-driver-online{width:100%;margin:4px 0;padding:10px;',
      'border-radius:10px;border:1px solid rgba(61,158,255,0.4);background:rgba(0,40,80,0.45);color:#e8f4ff;',
      'font-weight:600;cursor:pointer;font-size:11px;text-align:left}',
      '#mpp-apply{background:rgba(0,221,119,0.2);border-color:#00dd77;color:#00ff99;text-align:center}',
      '#mpp-post-now{background:rgba(255,100,40,0.18);border-color:#ff8844;color:#ffb088;text-align:center}',
      '#mpp-driver-online.on{border-color:#00dd77;color:#00ff99}',
      '#mpp-cover{height:72px;border-radius:12px;background:linear-gradient(135deg,#0a2d6b,#123);',
      'position:relative;overflow:hidden;margin-bottom:8px}',
      '#mpp-cover img{width:100%;height:100%;object-fit:cover}',
      '#mpp-avatar{width:56px;height:56px;border-radius:50%;border:2px solid #3d9eff;margin-top:-28px;margin-left:12px;',
      'background:#123;overflow:hidden;position:relative}',
      '#mpp-avatar img{width:100%;height:100%;object-fit:cover}',
      '#mpp-post-caption,#mpp-driver-schedule{width:100%;box-sizing:border-box;padding:8px;border-radius:8px;',
      'border:1px solid rgba(61,158,255,0.35);background:rgba(0,0,0,0.35);color:#e8f4ff;font:inherit;margin:4px 0}',
      '#mpp-connected-users{display:flex;flex-wrap:wrap;gap:6px;min-height:28px}',
      '.mpp-connected-user{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:10px;',
      'border:1px solid rgba(61,158,255,0.3);background:rgba(0,20,40,0.5);cursor:pointer;font-size:10px}',
      '#mpp-market-summary{font-size:10px;color:#9ab;margin:4px 0 8px}',
      '.mpp-media-row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}',
      '.mpp-media-row button{flex:1;min-width:70px;padding:8px;border-radius:8px;border:1px solid #456;background:rgba(0,20,40,0.5);color:#cdf;cursor:pointer}',
      '#mpp-media-preview{max-height:100px;margin:6px 0;border-radius:8px;overflow:hidden}',
      '#mpp-media-preview img,#mpp-media-preview video{max-width:100%;max-height:100px;display:block}',
    ].join('');
    document.head.appendChild(st);
  },

  _ensureCliEdge() {
    const bar = document.getElementById('super-cli-bar');
    if (!bar) return;
    let edge = document.getElementById('super-cli-edge-right')
      || document.getElementById('toolbar-trust-actions');
    if (!edge) {
      edge = document.createElement('div');
      edge.id = 'super-cli-edge-right';
      edge.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:auto';
      bar.appendChild(edge);
    }
    if (!edge.id || edge.id === 'toolbar-trust-actions') {
      edge.id = 'super-cli-edge-right';
    }
    // Trust order: 🎯 · 🎧 · 🛠 · 📹 · +  (never put 🎯 in hidden app-shortcut-row)
    const order = ['aci-locate', 'aci-handsfree', 'aci-bridge', 'aci-video-call', 'super-add-fab'];
    order.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === 'aci-locate') {
        el.classList.remove('app-shortcut-btn');
        el.hidden = false;
        el.style.display = 'inline-flex';
        el.removeAttribute('hidden');
      }
      if (el.parentElement !== edge) edge.appendChild(el);
    });
    // If MPP wrongly parked locate in app-shortcut-row, pull it back
    const loc = document.getElementById('aci-locate');
    const badRow = document.getElementById('app-shortcut-row');
    if (loc && badRow && badRow.contains(loc)) {
      const hf = document.getElementById('aci-handsfree');
      if (hf && edge.contains(hf)) edge.insertBefore(loc, hf);
      else edge.prepend(loc);
    }
  },

  _ensureVideoCall() {
    if (document.getElementById('aci-video-call')) return;
    const edge = document.getElementById('super-cli-edge-right');
    const fab = document.getElementById('super-add-fab');
    if (!edge || !fab) return;
    const btn = document.createElement('button');
    btn.id = 'aci-video-call';
    btn.type = 'button';
    btn.title = 'Video call — open peers';
    btn.setAttribute('aria-label', 'Video call');
    btn.textContent = '📹';
    edge.insertBefore(btn, fab);
  },

  _ensureMppTile() {
    if (document.getElementById('menu-profile-post-tile')) {
      this._ensureCityDnaSection();
      return;
    }
    const tile = document.createElement('div');
    tile.id = 'menu-profile-post-tile';
    tile.innerHTML = [
      '<div class="mpp-head">',
      '<b>▸ Super Add field</b>',
      '<button type="button" id="mpp-pin-pick" title="Pick pin on map">📍</button>',
      '<button type="button" id="mpp-close" title="Close">✖</button>',
      '</div>',
      '<div id="mpp-coords">📍 —</div>',
      '<div id="mpp-cover"><button type="button" id="mpp-cover-edit" style="position:absolute;right:8px;bottom:8px">Cover</button>',
      '<input id="mpp-cover-file" type="file" accept="image/*" hidden /></div>',
      '<div id="mpp-avatar"><button type="button" id="mpp-avatar-edit" style="position:absolute;right:-4px;bottom:-4px;font-size:10px">✎</button>',
      '<input id="mpp-avatar-file" type="file" accept="image/*" hidden /></div>',
      '<div id="mpp-roles">',
      '<button type="button" class="mpp-role-chip on" data-mpp-role="client">Client</button>',
      '<button type="button" class="mpp-role-chip" data-mpp-role="vendor">Vendor</button>',
      '<button type="button" class="mpp-role-chip" data-mpp-role="driver">Driver</button>',
      '<button type="button" class="mpp-role-chip on" data-mpp-role="user">User</button>',
      '<button type="button" class="mpp-role-chip on" data-mpp-role="social">Social</button>',
      '</div>',
      '<div id="mpp-section-market" class="mpp-section visible">',
      '<h4>Marketplace</h4>',
      '<div id="mpp-market-summary">Cart · delivery pin · Coins</div>',
      '<button type="button" class="mpp-act" data-mpp-act="browse_shops">Browse shops</button>',
      '<button type="button" class="mpp-act" data-mpp-act="set_delivery">Set delivery pin</button>',
      '<button type="button" class="mpp-act" data-mpp-act="place_cart">Place order (cart)</button>',
      '<button type="button" class="mpp-act" data-mpp-act="track_delivery">Track delivery</button>',
      '<div id="mpp-vendors"></div>',
      '</div>',
      '<div id="mpp-section-vendor" class="mpp-section">',
      '<h4>Vendor</h4>',
      '<button type="button" class="mpp-act" data-mpp-act="list_shop">List my shop here</button>',
      '<button type="button" class="mpp-act" data-mpp-act="browse_shops">Nearby shops</button>',
      '</div>',
      '<div id="mpp-section-driver" class="mpp-section">',
      '<h4>Driver</h4>',
      '<button type="button" id="mpp-driver-online" aria-pressed="false">Go online</button>',
      '<select id="mpp-driver-schedule"><option value="now">Available now</option>',
      '<option value="later">Later today</option><option value="off">Offline</option></select>',
      '<button type="button" class="mpp-act" data-mpp-act="set_driver_base">Set driver base</button>',
      '</div>',
      '<div id="mpp-section-user" class="mpp-section visible">',
      '<h4>Profile</h4>',
      '<button type="button" class="mpp-act" data-mpp-act="open_profile">Open profile site</button>',
      '<button type="button" class="mpp-act" data-mpp-act="set_delivery">Delivery address on map</button>',
      '</div>',
      '<div id="mpp-section-citydna" class="mpp-section visible">',
      '<h4>City DNA · jobs · dates · errands</h4>',
      '<div id="mpp-citydna-summary" style="font-size:10px;color:#9ab;margin:0 0 6px">Same as pizza: open → claim → done</div>',
      '<button type="button" class="mpp-act" data-mpp-act="post_job">💼 Post job (barman 3h…)</button>',
      '<button type="button" class="mpp-act" data-mpp-act="post_date">💕 Post date (coffee 2h…)</button>',
      '<button type="button" class="mpp-act" data-mpp-act="post_errand">🏃 Post errand</button>',
      '<button type="button" class="mpp-act" data-mpp-act="list_city_tasks">📋 Open tasks nearby</button>',
      '<button type="button" class="mpp-act" data-mpp-act="claim_open_task">✋ Claim open task</button>',
      '</div>',
      '<div id="mpp-section-social" class="mpp-section visible">',
      '<h4>Social post</h4>',
      '<textarea id="mpp-post-caption" rows="2" placeholder="Caption · job · date · errand…"></textarea>',
      '<div class="mpp-media-row">',
      '<button type="button" id="mpp-pick-photo">Photo</button>',
      '<button type="button" id="mpp-pick-video">Video</button>',
      '<button type="button" id="mpp-media-clear">Clear</button>',
      '</div>',
      '<input id="mpp-photo-file" type="file" accept="image/*" hidden />',
      '<input id="mpp-video-file" type="file" accept="video/*" hidden />',
      '<div id="mpp-media-preview"></div>',
      '<button type="button" id="mpp-post-now">Post now on globe</button>',
      '<button type="button" class="mpp-act" data-mpp-act="post_lust">Post pin</button>',
      '</div>',
      '<div id="mpp-connected" class="mpp-section visible">',
      '<h4>Connected · tap to video</h4>',
      '<div id="mpp-connected-users"></div>',
      '</div>',
      '<button type="button" id="mpp-apply">Primary action</button>',
    ].join('');
    document.body.appendChild(tile);
  },

  /** Inject City DNA actions into live MPP if shell already had an older tile */
  _ensureCityDnaSection() {
    if (document.getElementById('mpp-section-citydna')) return;
    const social = document.getElementById('mpp-section-social');
    const host = document.getElementById('menu-profile-post-tile');
    if (!host) return;
    const sec = document.createElement('div');
    sec.id = 'mpp-section-citydna';
    sec.className = 'mpp-section visible';
    sec.innerHTML = '<h4>City DNA · jobs · dates · errands</h4>'
      + '<div id="mpp-citydna-summary" style="font-size:10px;color:#9ab;margin:0 0 6px">Same as pizza: open → claim → done</div>'
      + '<button type="button" class="mpp-act" data-mpp-act="post_job">💼 Post job (barman 3h…)</button>'
      + '<button type="button" class="mpp-act" data-mpp-act="post_date">💕 Post date (coffee 2h…)</button>'
      + '<button type="button" class="mpp-act" data-mpp-act="post_errand">🏃 Post errand</button>'
      + '<button type="button" class="mpp-act" data-mpp-act="list_city_tasks">📋 Open tasks nearby</button>'
      + '<button type="button" class="mpp-act" data-mpp-act="claim_open_task">✋ Claim open task</button>';
    if (social) host.insertBefore(sec, social);
    else host.appendChild(sec);
    // Bind if MPP already inited
    sec.querySelectorAll('.mpp-act[data-mpp-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-mpp-act');
        if (window.MenuProfilePostTile?.runAction) MenuProfilePostTile.runAction(act);
        else this._cityDnaFallback(act);
      });
    });
  },

  _cityDnaFallback(act) {
    CityTasks?.init?.();
    const cap = (document.getElementById('mpp-post-caption')?.value || '').trim();
    const pin = window.MenuProfilePostTile?.pin || window._lastPos || { lat: 36.43, lng: 28.22 };
    if (act === 'post_job') {
      CityTasks.postJob({ rawText: cap || 'barman 3h', title: cap || undefined, lat: pin.lat, lng: pin.lng });
    } else if (act === 'post_date') {
      CityTasks.postDate({ rawText: cap || 'coffee date 2h', lat: pin.lat, lng: pin.lng });
    } else if (act === 'post_errand') {
      CityTasks.postErrand({ rawText: cap || 'pharmacy', lat: pin.lat, lng: pin.lng });
    } else if (act === 'list_city_tasks') {
      CityTasks.handleCli('task list');
    } else if (act === 'claim_open_task') {
      CityTasks.claim(null);
    }
  },

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src^="' + src.split('?')[0] + '"]')) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('load ' + src));
      document.head.appendChild(s);
    });
  },

  async loadProductScripts() {
    if (this._scriptsLoading || this._scriptsReady) return this._scriptsLoading;
    const build = document.querySelector('meta[name="astranov-build"]')?.content || '';
    const q = build ? '?v=' + encodeURIComponent(build) : '';
    this._scriptsLoading = Promise.all([
      this._loadScript('/astranov-field-hud.js' + q),
      this._loadScript('/astranov-mpp-tile.js' + q),
    ]).then(() => {
      this._scriptsReady = true;
      this._bootProductModules();
    }).catch((e) => {
      console.warn('[ProductSurface] scripts', e);
      this._scriptsLoading = null;
    });
    return this._scriptsLoading;
  },

  _bootProductModules() {
    try {
      if (window.FieldHud?.boot) FieldHud.boot();
      else if (window.FieldHud?.injectDom) {
        FieldHud.injectCss?.();
        FieldHud.injectDom?.();
        FieldHud.bindFieldMiner?.();
        FieldHud.patchSuperCli?.();
      }
    } catch (e) { console.warn('[ProductSurface] FieldHud', e); }

    try {
      if (window.MenuProfilePostTile?.init) MenuProfilePostTile.init();
    } catch (e) { console.warn('[ProductSurface] MPP', e); }

    // Wire + to MPP (load scripts on first tap if needed)
    const fab = document.getElementById('super-add-fab');
    if (fab && !fab._psBound) {
      fab._psBound = true;
      fab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const open = () => {
          if (window.MenuProfilePostTile?.openPlusField) MenuProfilePostTile.openPlusField();
          else AciCli?.print?.('Super Add loading…', 'dim');
        };
        if (window.MenuProfilePostTile) open();
        else this.loadProductScripts().then(open);
      }, true);
    }
    const vid = document.getElementById('aci-video-call');
    if (vid && !vid._psBound) {
      vid._psBound = true;
      vid.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const run = () => MenuProfilePostTile?._openVideoCall?.();
        if (window.MenuProfilePostTile) run();
        else this.loadProductScripts().then(run);
      }, true);
    }
  },
};

// Kick product scripts after first paint (not during core parse)
setTimeout(() => {
  try {
    if (window.ProductSurface) {
      ProductSurface.init?.();
      const delay = window._globePerfLite ? 2200 : 900;
      setTimeout(() => ProductSurface.loadProductScripts?.(), delay);
    }
  } catch (_) {}
}, 400);
window.ProductSurface = ProductSurface;
