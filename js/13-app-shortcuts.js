// === APP SHORTCUTS — open CLI apps as top-bar icons (account · apps · +) ===
var AppShortcuts = {
  _row: null,
  _order: [],
  _labels: {},
  _siteMeta: null,

  APPS: {
    coders: {
      icon: '🧠',
      title: 'Coders',
      activate() {
        void AciCoders?.enterSession?.({ ping: true });
      },
      close() {
        GlobeDeck.activeTask = null;
        GlobeDeck?.hideStage?.();
        GlobeDeck?.setTitle?.(PublicCopy?.deckTitle?.() || SuperCli?.title || 'Astranov');
        SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
      },
    },
    commerce: {
      icon: '🛒',
      title: 'Shops',
      activate() {
        window.Commerce?.initUI?.();
        if (window.Commerce?.selected) {
          window.Commerce.showMenu();
          const list = document.getElementById('vm-list');
          const detail = document.getElementById('vm-detail');
          if (list) list.style.display = 'none';
          if (detail) detail.style.display = 'block';
          const title = document.getElementById('vm-title');
          if (title) title.textContent = (window.Commerce.selected.icon || '🏪') + ' ' + window.Commerce.selected.name;
          window.Commerce.renderCart?.();
        } else {
          window.Commerce?.showPicker?.();
        }
        SuperCli?.setContext?.('commerce');
      },
      close() {
        window.Commerce?.hideMenu?.();
        if (GlobeDeck?.activeTask === 'commerce') GlobeDeck?.completeTask?.('commerce');
      },
    },
    batch: {
      icon: '🔗',
      title: 'Batch',
      activate() {
        window.AstranovNode?.showPanel?.();
        SuperCli?.setContext?.('batch');
      },
      close() {
        window.AstranovNode?.hidePanel?.();
      },
    },
    radio: {
      icon: '📡',
      title: 'PMR',
      activate() {
        PmrRadio?.show?.();
        SuperCli?.setContext?.('radio');
      },
      close() {
        PmrRadio?.hide?.();
      },
    },
    video: {
      icon: '▶️',
      title: 'Video',
      activate() {
        GlobeVideo?.showPanel?.(GlobeVideo?._lastQuery || 'YouTube on globe');
        if (GlobeVideo?._currentId) void GlobeVideo?.play?.(GlobeVideo._currentId);
      },
      close() {
        GlobeVideo?.hide?.();
      },
    },
    add: {
      icon: '📹',
      title: 'Post',
      activate() {
        window.SuperAdd?.showPanel?.();
        window.SuperAdd?.startCamera?.();
        SuperCli?.setContext?.('add');
      },
      close() {
        window.SuperAdd?.hide?.();
      },
    },
    drive: {
      icon: '🚗',
      title: 'Drive',
      activate() {
        window.DrivingView?.activate?.();
        SuperCli?.setContext?.('drive');
      },
      close() {
        if (window.DrivingView?.active) window.DrivingView.deactivate();
        else AppShortcuts.untrack('drive');
      },
    },
    phone: {
      icon: '☎️',
      title: 'Phone',
      activate() {
        GlobeDeck?.hideStage?.();
        GlobeDeck.activeTask = 'phone';
        GlobeDeck?.expand?.((PublicCopy?.deckTitle?.() || 'Astranov') + ' — phone');
        SuperCli?.setContext?.('phone');
        document.getElementById('aci-cli-in')?.focus();
      },
      close() {
        if (GlobeDeck?.activeTask === 'phone') GlobeDeck.activeTask = null;
        SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
      },
    },
    chats: {
      icon: '💬',
      title: 'Chats',
      activate() {
        window.CliHub?.openPanel?.();
        SuperCli?.setContext?.('chats');
      },
      close() {
        window.CliHub?.closePanel?.();
      },
    },
    coin: {
      icon: '◎',
      title: 'Coins',
      activate() {
        CoinPortal?.open?.('wallet');
        SuperCli?.setContext?.('coin');
      },
      close() {
        AstranovSiteShell?.close?.();
      },
    },
    site: {
      icon: '🌐',
      title: 'Site',
      activate() {
        const meta = AstranovSiteShell?.active || AppShortcuts._siteMeta;
        if (meta?.url) AstranovSiteShell?.open?.(meta.url, meta);
      },
      close() {
        AstranovSiteShell?.close?.();
      },
    },
  },

  init() {
    const bar = document.getElementById('super-cli-bar');
    const login = document.getElementById('aci-login');
    if (!bar || !login) return;
    let row = document.getElementById('app-shortcut-row');
    if (!row) {
      row = document.createElement('div');
      row.id = 'app-shortcut-row';
      row.setAttribute('role', 'toolbar');
      row.setAttribute('aria-label', 'Open applications');
      login.insertAdjacentElement('afterend', row);
    }
    this._row = row;
    this.render();
  },

  isOpen(id) {
    return this._order.includes(id);
  },

  active() {
    return GlobeDeck?.activeTask || this._order[this._order.length - 1] || null;
  },

  track(id, label) {
    const key = this._norm(id);
    if (!key || !this.APPS[key]) return;
    if (!this._order.includes(key)) this._order.push(key);
    if (label) this._labels[key] = String(label).slice(0, 48);
    this.render();
  },

  untrack(id) {
    const key = this._norm(id);
    if (!key) return;
    this._order = this._order.filter(x => x !== key);
    delete this._labels[key];
    if (key === 'site') this._siteMeta = null;
    this.render();
  },

  rememberSite(meta) {
    if (meta?.url) this._siteMeta = { ...meta };
  },

  _norm(id) {
    const s = String(id || '').toLowerCase();
    if (s === 'vhf' || s === 'pmr') return 'radio';
    if (s === 'node' || s === 'node-batch') return 'batch';
    if (s === 'youtube' || s === 'yt') return 'video';
    if (s === 'vendor-menu' || s === 'order' || s === 'shop' || s === 'shops') return 'commerce';
    if (s === 'globe-super-add' || s === 'superadd' || s === 'post') return 'add';
    return s;
  },

  switchTo(id) {
    const key = this._norm(id);
    if (!key || !this.APPS[key] || !this.isOpen(key)) return;
    if (GlobeDeck) GlobeDeck._userEngaged = true;
    try {
      this.APPS[key].activate();
      GlobeDeck.activeTask = key === 'phone' || key === 'coders' ? key : (GlobeDeck?.activeTask || key);
      this.render();
    } catch (e) {
      console.warn('[AppShortcuts] switch', key, e);
    }
  },

  closeApp(id) {
    const key = this._norm(id);
    if (!key || !this.APPS[key]) return false;
    try {
      this.APPS[key].close?.();
    } catch (e) {
      console.warn('[AppShortcuts] close', key, e);
    }
    this.untrack(key);
    return true;
  },

  closeCurrent() {
    const id = GlobeDeck?.activeTask || this._order[this._order.length - 1];
    if (id && this.isOpen(id)) return this.closeApp(id);
    if (AstranovSiteShell?.isOpen?.()) return this.closeApp('site');
    return false;
  },

  render() {
    if (!this._row) return;
    this._row.innerHTML = '';
    const focus = GlobeDeck?.activeTask || null;
    for (const id of this._order) {
      const app = this.APPS[id];
      if (!app) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'app-shortcut-btn';
      btn.dataset.app = id;
      btn.title = this._labels[id] || app.title;
      btn.setAttribute('aria-label', this._labels[id] || app.title);
      btn.textContent = app.icon;
      if (id === focus || (id === 'site' && AstranovSiteShell?.isOpen?.())) {
        btn.classList.add('active');
      }
      btn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        this.switchTo(id);
      };
      this._row.appendChild(btn);
    }
    CliRibbon?.render?.();
  },
};
window.AppShortcuts = AppShortcuts;
