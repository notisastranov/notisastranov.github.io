// === PROFILE SITE — every user & vendor fills their page; opens on tap ===
const ProfileSite = {
  targetId: null,
  targetType: 'user',
  _vendor: null,
  _draft: null,

  init() {
    this._bind();
  },

  _bind() {
    const panel = document.getElementById('profile-site-panel');
    if (!panel || panel.dataset.bound) return;
    panel.dataset.bound = '1';
    document.getElementById('ps-close')?.addEventListener('click', () => this.close());
    document.getElementById('ps-save')?.addEventListener('click', () => this.save());
    document.getElementById('ps-site-req')?.addEventListener('click', () => this.requestSubdomain());
    document.getElementById('ps-open-site')?.addEventListener('click', () => this.openLiveSite());
    document.getElementById('ps-shop')?.addEventListener('click', () => {
      if (this._vendor) Commerce?.openVendor?.(this._vendor);
    });
    document.getElementById('ps-logout')?.addEventListener('click', () => Auth?.signOut?.());
  },

  esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  isSelf(id) {
    return Auth?.user?.id && id === Auth.user.id;
  },

  async loadProfile(userId) {
    if (!Auth?.client) return null;
    const { data } = await Auth.client
      .from('profiles')
      .select('id,username,display_name,avatar_emoji,bio,phone,public_email,profile_page,site_slug,site_request_status,roles,is_vendor')
      .eq('id', userId)
      .maybeSingle();
    return data;
  },

  async openUser(userId, opts) {
    opts = opts || {};
    if (!userId) return;
    this.targetId = userId;
    this.targetType = 'user';
    this._vendor = opts.vendor || null;
    const prof = await this.loadProfile(userId);
    if (!prof) {
      ACIControl?.reply('Profile not found');
      return;
    }
    this._render(prof);
    document.getElementById('profile-site-panel')?.classList.add('open');
    const lat = window._lastPos?.lat;
    const lng = window._lastPos?.lng;
    if (lat != null && this.isSelf(userId)) {
      Responsive3D?.visualReact?.('profile', { lat, lng });
      GlobeEntity?.syncMe?.(lat, lng, prof.display_name || 'You', { alwaysShow: true });
    } else {
      MapDepict?.pulse?.(lat, lng, 0x49b7ff, prof.display_name || 'Profile', 8000);
    }
  },

  async openVendor(vendor) {
    if (!vendor) return;
    this._vendor = vendor;
    const ownerId = vendor.owner_id;
    if (ownerId) {
      await this.openUser(ownerId, { vendor });
    } else {
      this.targetType = 'vendor';
      this._renderVendorOnly(vendor);
      document.getElementById('profile-site-panel')?.classList.add('open');
    }
  },

  _page(prof) {
    const p = prof?.profile_page;
    return (p && typeof p === 'object') ? p : {};
  },

  _render(prof) {
    // Prefer MultiTile as universal profile at all zoom levels
    if (window.MultiTile?.openUser && prof) {
      MultiTile.openUser(prof, {
        lat: prof.field_lat ?? window._lastPos?.lat,
        lng: prof.field_lng ?? window._lastPos?.lng,
        source: 'profile',
        tier: MultiTile.currentTier?.(),
      });
      return;
    }
    const panel = document.getElementById('profile-site-panel');
    if (!panel) return;
    const page = this._page(prof);
    const self = this.isSelf(prof.id);
    const emoji = prof.avatar_emoji || '👤';
    const title = page.title || prof.display_name || prof.username || 'Profile';
    const subtitle = page.subtitle || prof.bio || '';
    const about = page.about || prof.bio || '';
    const services = Array.isArray(page.services) ? page.services : [];
    const contact = page.contact || {};

    document.getElementById('ps-title').textContent = emoji + ' ' + title;
    document.getElementById('ps-sub').textContent = subtitle;
    const body = document.getElementById('ps-body');
    if (!body) return;

    if (self) {
      this._draft = {
        title: page.title || prof.display_name || '',
        subtitle: page.subtitle || '',
        about: about,
        services: services.join('\n'),
        phone: prof.phone || contact.phone || '',
        email: prof.public_email || contact.email || Auth?.user?.email || '',
        site_slug: prof.site_slug || '',
      };
      body.innerHTML = ''
        + '<label class="ps-field">Title<input id="ps-in-title" value="' + this.esc(this._draft.title) + '" /></label>'
        + '<label class="ps-field">Subtitle<input id="ps-in-sub" value="' + this.esc(this._draft.subtitle) + '" /></label>'
        + '<label class="ps-field">About<textarea id="ps-in-about" rows="3">' + this.esc(this._draft.about) + '</textarea></label>'
        + '<label class="ps-field">Services (one per line)<textarea id="ps-in-svc" rows="2">' + this.esc(this._draft.services) + '</textarea></label>'
        + '<label class="ps-field">Phone<input id="ps-in-phone" value="' + this.esc(this._draft.phone) + '" /></label>'
        + '<label class="ps-field">Public email<input id="ps-in-email" value="' + this.esc(this._draft.email) + '" /></label>'
        + '<label class="ps-field">Subdomain slug<input id="ps-in-slug" placeholder="my-yachts" value="' + this.esc(this._draft.site_slug) + '" /></label>'
        + '<div class="ps-hint">Subdomain needs admin approval · profile page is live now on tap</div>'
        + this._rolesHtml(prof.roles);
      document.getElementById('ps-save').style.display = 'inline-block';
      document.getElementById('ps-site-req').style.display = 'inline-block';
      document.getElementById('ps-logout').style.display = 'inline-block';
      this._bindRoleToggles();
    } else {
      body.innerHTML = ''
        + (about ? '<div class="ps-about">' + this.esc(about) + '</div>' : '')
        + (services.length ? '<div class="ps-svc">' + services.map(s => '<span class="ps-tag">' + this.esc(s) + '</span>').join('') + '</div>' : '')
        + (contact.phone || prof.phone ? '<div class="ps-line">📞 ' + this.esc(contact.phone || prof.phone) + '</div>' : '')
        + (contact.email || prof.public_email ? '<div class="ps-line">✉ ' + this.esc(contact.email || prof.public_email) + '</div>' : '')
        + (prof.site_slug ? '<div class="ps-line">◎ ' + this.esc(prof.site_slug) + '.astranov.eu · ' + this.esc(prof.site_request_status || 'none') + '</div>' : '');
      document.getElementById('ps-save').style.display = 'none';
      document.getElementById('ps-site-req').style.display = 'none';
      document.getElementById('ps-logout').style.display = 'none';
    }

    const shopBtn = document.getElementById('ps-shop');
    if (shopBtn) shopBtn.style.display = this._vendor ? 'inline-block' : 'none';

    const siteBtn = document.getElementById('ps-open-site');
    const live = prof.site_request_status === 'approved' || prof.site_request_status === 'live';
    if (siteBtn) {
      siteBtn.style.display = (prof.site_slug && live) ? 'inline-block' : 'none';
      siteBtn.dataset.url = prof.site_slug ? ('https://' + prof.site_slug + '.astranov.eu') : '';
    }

    const statusEl = document.getElementById('ps-status');
    if (statusEl) {
      const st = prof.site_request_status || 'none';
      statusEl.textContent = st === 'pending' ? '⏳ Subdomain pending admin approval'
        : st === 'live' || st === 'approved' ? '✓ ' + (prof.site_slug || '') + '.astranov.eu live'
        : '';
    }
  },

  _renderVendorOnly(vendor) {
    document.getElementById('ps-title').textContent = (vendor.emoji || '🏬') + ' ' + (vendor.name || 'Shop');
    document.getElementById('ps-sub').textContent = vendor.category || 'vendor';
    const body = document.getElementById('ps-body');
    if (body) {
      body.innerHTML = '<div class="ps-about">Tap Shop to order · vendor on Astranov map</div>';
    }
    document.getElementById('ps-save').style.display = 'none';
    document.getElementById('ps-site-req').style.display = 'none';
    document.getElementById('ps-shop').style.display = 'inline-block';
    this._vendor = vendor;
  },

  _normRoles(roles) {
    const arr = Array.isArray(roles) ? roles.slice() : ['client', 'driver'];
    if (!arr.includes('client')) arr.unshift('client');
    return arr;
  },

  _rolesHtml(roles) {
    const r = this._normRoles(roles);
    const defs = [
      { id: 'client', label: 'Customer', icon: '🧑' },
      { id: 'driver', label: 'Delivery driver', icon: '🚚' },
      { id: 'vendor', label: 'Vendor', icon: '🏬' },
    ];
    return '<div class="ps-roles-title">Active roles · tap to toggle</div>'
      + '<div class="ps-role-row">'
      + defs.map(d => {
        const on = r.includes(d.id);
        return '<button type="button" class="ps-role-btn' + (on ? ' active' : '') + '" data-role="' + d.id + '">'
          + d.icon + ' ' + d.label + '</button>';
      }).join('')
      + '</div>';
  },

  _bindRoleToggles() {
    document.querySelectorAll('.ps-role-btn[data-role]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this.toggleRole(btn.dataset.role));
    });
  },

  async toggleRole(role) {
    if (!Auth?.user || !this.isSelf(this.targetId)) return;
    const allowed = ['client', 'driver', 'vendor'];
    if (!allowed.includes(role)) return;
    const prof = await this.loadProfile(Auth.user.id);
    const roles = this._normRoles(prof?.roles);
    const i = roles.indexOf(role);
    if (role === 'client') {
      if (i < 0) roles.push('client');
    } else if (i >= 0) {
      if (role === 'driver' && roles.length <= 1) {
        ACIControl?.reply('Keep at least customer role active');
        return;
      }
      roles.splice(i, 1);
    } else {
      roles.push(role);
    }
    try {
      const headers = await Auth.authHeaders();
      await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + Auth.user.id, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          roles,
          is_vendor: roles.includes('vendor'),
          updated_at: new Date().toISOString(),
        }),
      });
      FieldBrain.roles = roles;
      FieldBrain?.updateChip?.();
      ACIControl?.reply('Roles: ' + roles.join(' · '));
      Responsive3D?.visualReact?.('profile', {});
      await this.openUser(Auth.user.id, { vendor: this._vendor });
    } catch (e) {
      ACIControl?.reply('Role update failed: ' + (e.message || e));
    }
  },

  _collectDraft() {
    return {
      title: document.getElementById('ps-in-title')?.value?.trim() || '',
      subtitle: document.getElementById('ps-in-sub')?.value?.trim() || '',
      about: document.getElementById('ps-in-about')?.value?.trim() || '',
      services: (document.getElementById('ps-in-svc')?.value || '').split('\n').map(s => s.trim()).filter(Boolean),
      phone: document.getElementById('ps-in-phone')?.value?.trim() || '',
      email: document.getElementById('ps-in-email')?.value?.trim() || '',
      site_slug: document.getElementById('ps-in-slug')?.value?.trim() || '',
    };
  },

  async save() {
    if (!Auth?.user || !this.isSelf(this.targetId)) return;
    const d = this._collectDraft();
    const profile_page = {
      title: d.title,
      subtitle: d.subtitle,
      about: d.about,
      services: d.services,
      contact: { phone: d.phone, email: d.email },
      updated_at: new Date().toISOString(),
    };
    try {
      const headers = await Auth.authHeaders();
      await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + Auth.user.id, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          display_name: d.title || undefined,
          bio: d.about || undefined,
          phone: d.phone || null,
          public_email: d.email || null,
          profile_page,
          updated_at: new Date().toISOString(),
        }),
      });
      ACIControl?.reply('Profile saved — others see it when they tap you on the map');
      AciCli?.print('profile saved', 'ok');
      await this.openUser(Auth.user.id, { vendor: this._vendor });
    } catch (e) {
      ACIControl?.reply('Save failed: ' + (e.message || e));
    }
  },

  async requestSubdomain() {
    if (!Auth?.user) return Auth?.openLoginModal?.('Sign in for profile');
    const d = this._collectDraft();
    const slug = AstranovSitesProvision?.slugify?.(d.site_slug) || '';
    if (!slug || slug.length < 3) {
      ACIControl?.reply('Enter subdomain slug (3+ letters) in profile');
      return;
    }
    try {
      const r = await AstranovSitesProvision.provision({
        slug,
        business_name: d.title || slug,
        business_type: /yacht|charter/i.test(d.about + d.title) ? 'yacht_charter' : 'generic',
        mode: /yacht|charter/i.test(d.about + d.title) ? 'range' : 'slot',
      });
      if (r.pending_approval) {
        ACIControl?.reply('Subdomain ' + r.domain + ' requested — pending admin approval. Profile page is live on map.');
      }
      await this.save();
    } catch (e) {
      ACIControl?.reply(String(e.message || e));
    }
  },

  openLiveSite() {
    const url = document.getElementById('ps-open-site')?.dataset?.url;
    if (!url) return;
    AstranovSiteShell?.open?.(url, { domain: url.replace(/^https:\/\//, ''), title: document.getElementById('ps-title')?.textContent });
  },

  close() {
    document.getElementById('profile-site-panel')?.classList.remove('open');
    this.targetId = null;
    this._vendor = null;
  },

  async openSelf() {
    if (!Auth?.user) return Auth?.openLoginModal?.('Sign in to edit your profile page');
    await this.openUser(Auth.user.id);
  },

  async cmd(parts) {
    const sub = (parts[1] || 'me').toLowerCase();
    if (sub === 'me' || sub === 'edit') return this.openSelf();
    if (sub === 'save') return this.save();
    const name = parts.slice(1).join(' ').toLowerCase();
    const hit = (window.others || []).find(u => (u.name || '').toLowerCase().includes(name));
    if (hit?.id) return this.openUser(hit.id);
    ACIControl?.reply('profile me · profile save · tap a player on map');
  },
};

window.ProfileSite = ProfileSite;
