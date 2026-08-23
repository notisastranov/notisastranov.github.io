// === ASTRANOV IDENTITY — unified login (globe + all *.astranov.eu sites) ===
const Auth = {
  client: null,
  user: null,
  session: null,
  isOwner: false,
  isArchitect: false,
  OWNER_EMAIL: 'notisastranov@gmail.com',
  OAUTH_PROVIDERS: ['google', 'facebook', 'apple', 'twitter'],
  _siteOwners: new Map(),
  _profileVisual: null,
  _authDegraded: false,
  _authBoot: true,
  _gsiReady: null,
  GOOGLE_CLIENT_ID: typeof ASTRANOV_GOOGLE_CLIENT_ID !== 'undefined' ? ASTRANOV_GOOGLE_CLIENT_ID : '',

  init() {
    if (typeof supabase === 'undefined') {
      console.warn('[Auth] Supabase SDK missing — login unavailable');
      return;
    }
    const clientUrl = typeof resolveAstranovSupabaseClientUrl === 'function'
      ? resolveAstranovSupabaseClientUrl()
      : SB_URL;
    this.client = supabase.createClient(clientUrl, SB_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'astranov_auth_v2' },
    });
    this.client.auth.onAuthStateChange((ev, session) => {
      if (ev === 'SIGNED_IN' && session?.user) {
        this.session = session;
        this.user = session.user;
        this._authDegraded = false;
        this.closeLoginModal();
        this.applyUser();
        this.refreshAuthority();
        const owner = (session.user.email || '').toLowerCase() === this.OWNER_EMAIL.toLowerCase();
        ACIControl?.reply(owner
          ? 'Architect signed in · Grok ready · 🎧'
          : 'Signed in · tap 🎧 talk to Astranov');
        setTimeout(() => {
          primeGrokVoice?.();
          // Architect: open AI session (paid path); do not auto-locate
          if (owner) {
            void AciCoders?.enterSession?.({ expand: true, focus: false, ping: true });
          }
        }, 800);
        try {
          const clean = location.pathname + (location.search || '').replace(/[?&]code=[^&]*/g, '').replace(/[?&]error=[^&]*/g, '').replace(/\?&/, '?').replace(/\?$/, '');
          if (location.search || location.hash) history.replaceState(null, '', clean || '/');
        } catch (_) {}
        return;
      }
      if (ev === 'TOKEN_REFRESHED' && session?.user) {
        this.session = session;
        this.user = session.user;
        this._authDegraded = false;
        this.applyUser();
        return;
      }
      if (!session?.user && this.user && ev !== 'SIGNED_OUT') {
        this._authDegraded = true;
        this.applyUser();
        this.ensureSession().then((s) => {
          if (s?.user) {
            this.session = s;
            this.user = s.user;
            this._authDegraded = false;
            this.applyUser();
            this.refreshAuthority();
          }
        });
        return;
      }
      this.session = session;
      this.user = session?.user || null;
      this._authDegraded = false;
      this.applyUser();
      this.refreshAuthority();
      this.broadcastToShell();
      if (this.user) this.loadProfileVisual();
    });
    this._handleOAuthReturn();
    this.client.auth.getSession().then(({ data }) => {
      this._authBoot = false;
      this.session = data?.session || null;
      this.user = data?.session?.user || null;
      this.applyUser();
      this.refreshAuthority();
      this.broadcastToShell();
      if (this.user) this.loadProfileVisual();
    });
    const btn = document.getElementById('aci-login');
    if (btn) btn.onclick = () => this.user ? this.openLoggedInProfile() : this.signInGoogle();
    this.bindAuthModal();
    this._recoverFromAuthError();
    window.addEventListener('message', e => this._onChildMessage(e));
  },

  _recoverFromAuthError() {
    const q = location.search + location.hash;
    if (!/[?&#]error=/i.test(q) && !/access.denied|invalid_client|oauth/i.test(q)) return;
    setTimeout(() => {
      this.openLoginModal('Google blocked you — use email sign-in link below');
      this._activateSignInPane();
      ACIControl?.reply('Google OAuth blocked — tap Send sign-in link');
    }, 400);
  },

  _activateSignInPane() {
    const modal = document.getElementById('astranov-auth-modal');
    if (!modal) return;
    modal.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    modal.querySelectorAll('.auth-pane').forEach(p => p.classList.remove('active'));
    const tab = modal.querySelector('[data-pane="auth-pane-signin"]');
    const pane = document.getElementById('auth-pane-signin');
    if (tab) tab.classList.add('active');
    if (pane) pane.classList.add('active');
  },

  bindAuthModal() {
    const modal = document.getElementById('astranov-auth-modal');
    if (!modal || modal.dataset.bound) return;
    modal.dataset.bound = '1';
    document.getElementById('auth-close')?.addEventListener('click', () => this.closeLoginModal());
    document.getElementById('auth-signin-btn')?.addEventListener('click', () => this.signInIdentifier());
    document.getElementById('auth-signup-btn')?.addEventListener('click', () => this.signUpIdentifier());
    document.getElementById('auth-phone-btn')?.addEventListener('click', () => this.signInPhoneOtp());
    document.getElementById('auth-google-continue')?.addEventListener('click', () => this.continueWithGoogle());
    document.getElementById('auth-email-link')?.addEventListener('click', () => this.sendMagicLink());
    document.getElementById('auth-email-quick')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.sendMagicLink(); }
    });
    document.getElementById('auth-oauth-help')?.addEventListener('click', (e) => {
      e.preventDefault();
      const status = document.getElementById('auth-status');
      if (status) status.textContent = 'GCP fix: add redirect URI lkoatrkhuigdolnjsbie.supabase.co/auth/v1/callback + JS origin astranov.eu';
      ACIControl?.reply('Google OAuth needs GCP Console fix — email link works now');
    });
    modal.querySelectorAll('[data-oauth]').forEach(btn => {
      btn.addEventListener('click', () => this.signInOAuth(btn.dataset.oauth));
    });
    // Redirect OAuth only — GSI needs GCP JS origins per host and fails on astranov.eu
    modal.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        modal.querySelectorAll('.auth-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const pane = document.getElementById(tab.dataset.pane);
        if (pane) pane.classList.add('active');
      });
    });
  },

  async openLoggedInProfile() {
    if (!this.user) return this.openLoginModal();
    Responsive3D?.visualReact?.('profile', {});
    GlobeDeck?.expand?.('Your profile · 3D');
    const name = this._profileVisual?.display_name
      || this.user.user_metadata?.full_name
      || (this.user.email || '').split('@')[0]
      || 'You';
    const flyToMe = (lat, lng) => {
      if (lat == null || lng == null) return;
      GlobeEntity?.syncMe?.(lat, lng, name, { alwaysShow: true });
      const fp = latLngToPos(lat, lng, 1.04);
      const z = GlobeControl?.Z?.national || 1.82;
      const dur = GlobeControl?.flyDuration?.(camera?.position?.z, z) || 2200;
      flyToPoint?.(new THREE.Vector3(fp.x, fp.y, fp.z), z, { dur });
      GlobeControl?.noteAutoFly?.();
      MapDepict?.pulse?.(lat, lng, 0x49b7ff, name, 8000);
      ACIControl?.reply('Flying to you · ' + lat.toFixed(2) + ', ' + lng.toFixed(2));
    };
    const openProfile = (skipFly) => {
      if (!skipFly && window._lastPos) flyToMe(window._lastPos.lat, window._lastPos.lng);
      ProfileSite?.openSelf?.();
    };
    if (!navigator.geolocation) {
      openProfile(false);
      return;
    }
    GlobeDeck?.setMapStatus?.('Locating…');
    navigator.geolocation.getCurrentPosition(
      pos => {
        placeMe(pos.coords.latitude, pos.coords.longitude, { fly: true, zoom: GlobeControl?.Z?.national || 1.82 });
        openProfile(true);
      },
      () => openProfile(false),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
  },

  publicOrigin() {
    return typeof astranovPublicOrigin === 'function' ? astranovPublicOrigin() : (location.origin || 'https://astranov.eu');
  },

  _useGoogleRedirectOnly() {
    try {
      const host = location.hostname || '';
      return host === 'astranov.eu' || host.endsWith('.astranov.eu');
    } catch (_) {
      return true;
    }
  },

  _oauthRedirectTo() {
    try {
      const url = new URL(window.location.href);
      ['code', 'error', 'error_description', 'error_code'].forEach((k) => url.searchParams.delete(k));
      url.hash = '';
      return url.origin + url.pathname + (url.search || '');
    } catch (_) {
      return this.publicOrigin() + '/';
    }
  },

  async _handleOAuthReturn() {
    if (!this.client) return;
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const err = params.get('error') || params.get('error_description');
    if (err) return;
    if (!code) return;
    const status = document.getElementById('auth-status');
    if (status) status.textContent = 'Completing Google sign-in…';
    GlobeDeck?.setPreview?.('Signing in…');
    try {
      const { error } = await this.client.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } catch (e) {
      const msg = typeof scrubSupabaseLeak === 'function' ? scrubSupabaseLeak(e.message) : (e.message || e);
      this.openLoginModal('Google sign-in failed — ' + msg);
      ACIControl?.reply('Google sign-in failed — try email link below');
    }
  },

  openLoginModal(hint) {
    const modal = document.getElementById('astranov-auth-modal');
    if (!modal) return;
    const status = document.getElementById('auth-status');
    const origin = this.publicOrigin();
    const originEl = document.getElementById('auth-origin-url');
    if (originEl) originEl.textContent = origin;
    const inline = document.getElementById('auth-origin-inline');
    if (inline) inline.textContent = origin.replace(/^https?:\/\//, '');
    modal.classList.add('open');
    this._activateSignInPane();
    const emailQuick = document.getElementById('auth-email-quick');
    if (emailQuick && !emailQuick.value) {
      emailQuick.placeholder = this.OWNER_EMAIL;
      setTimeout(() => emailQuick.focus(), 300);
    }
    if (status) {
      status.textContent = hint || 'Continue with Google — or enter email for a sign-in link';
    }
    GlobeDeck?.expand?.('Sign in · Google or email');
    if (!hint) ACIControl?.reply('Tap Continue with Google — or use email link');
  },

  closeLoginModal() {
    document.getElementById('astranov-auth-modal')?.classList.remove('open');
  },

  _isMobileClient() {
    try {
      if (navigator.maxTouchPoints > 1 && window.innerWidth < 1024) return true;
      return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    } catch (_) {
      return false;
    }
  },

  _gsiInitialized: false,

  _ensureGoogleGsi() {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (this._gsiReady) return this._gsiReady;
    this._gsiReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Google sign-in script failed'));
      document.head.appendChild(s);
    });
    return this._gsiReady;
  },

  _renderGoogleButton(host) {
    if (!host || !window.google?.accounts?.id) return;
    host.innerHTML = '';
    window.google.accounts.id.renderButton(host, {
      type: 'standard',
      theme: 'filled_blue',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      logo_alignment: 'left',
      width: Math.min(320, host.clientWidth || 280),
    });
  },

  _mountGoogleButton() {
    const host = document.getElementById('auth-google-btn');
    if (!host) return;
    this._ensureGoogleGsi().then(() => {
      if (!this.GOOGLE_CLIENT_ID) return;
      this._initGoogleCredential();
      this._renderGoogleButton(host);
    }).catch(() => {});
  },

  _initGoogleCredential() {
    if (this._gsiInitialized || !window.google?.accounts?.id || !this.GOOGLE_CLIENT_ID) return;
    this._gsiInitialized = true;
    const origin = this.publicOrigin();
    window.google.accounts.id.initialize({
      client_id: this.GOOGLE_CLIENT_ID,
      callback: async (resp) => {
        const status = document.getElementById('auth-status');
        try {
          if (!resp?.credential) throw new Error('Google sign-in cancelled');
          if (status) status.textContent = 'Signing in…';
          const { data, error } = await this.client.auth.signInWithIdToken({
            provider: 'google',
            token: resp.credential,
          });
          if (error) throw error;
          this.closeLoginModal();
          ACIControl?.reply('Signed in at ' + origin);
          return data;
        } catch (e) {
          const msg = typeof scrubSupabaseLeak === 'function' ? scrubSupabaseLeak(e.message) : (e.message || e);
          if (/invalid_client|no registered origin|401/i.test(msg)) {
            if (status) status.textContent = 'Trying alternate sign-in…';
            try { await this._signInGoogleRedirect(); return; } catch (_) {}
          }
          if (status) status.textContent = msg;
          ACIControl?.reply('Google sign-in failed — ' + msg);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      context: 'signin',
      itp_support: true,
    });
  },

  async continueWithGoogle() {
    if (!this.client) return;
    return this._signInGoogleRedirect();
  },

  async sendMagicLink() {
    if (!this.client) return;
    const status = document.getElementById('auth-status');
    const emailEl = document.getElementById('auth-email-quick');
    let email = this._normalizeId(emailEl?.value || document.getElementById('auth-identifier')?.value);
    if (!email || !email.includes('@')) {
      email = this.OWNER_EMAIL;
      if (emailEl) emailEl.value = email;
    }
    try {
      if (status) status.textContent = 'Sending link to ' + email + '…';
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await this.client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      if (error) throw error;
      if (status) status.textContent = '✓ Link sent to ' + email + ' — open Gmail on THIS phone · check spam · tap Astranov link';
      ACIControl?.reply('Email sent — open inbox on this phone');
    } catch (e) {
      const msg = typeof scrubSupabaseLeak === 'function' ? scrubSupabaseLeak(e.message) : (e.message || e);
      if (status) status.textContent = msg;
      ACIControl?.reply('Email sign-in failed — ' + msg);
    }
  },

  async signInGoogle() {
    if (!this.client) return;
    const origin = this.publicOrigin();
    GlobeDeck?.setPreview?.('Sign in · ' + origin);
    return this._signInGoogleRedirect();
  },

  async _signInGoogleRedirect() {
    if (!this.client) return;
    const origin = this.publicOrigin();
    const status = document.getElementById('auth-status');
    if (status) status.textContent = 'Opening Google… returning to ' + origin.replace(/^https?:\/\//, '');
    GlobeDeck?.setPreview?.('Sign in · ' + origin);
    ACIControl?.reply('Opening Google sign-in…');
    const redirectTo = this._oauthRedirectTo();
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        scopes: 'email profile',
        queryParams: { prompt: 'select_account', access_type: 'offline' },
        skipBrowserRedirect: false,
      },
    });
    if (error) {
      const msg = typeof scrubSupabaseLeak === 'function' ? scrubSupabaseLeak(error.message) : error.message;
      this.openLoginModal('Google sign-in failed — ' + msg);
      ACIControl?.reply('Google failed — use email sign-in link');
      throw error;
    }
    if (data?.url) window.location.assign(data.url);
  },

  async signInOAuth(provider) {
    if (!this.client) return;
    if (provider === 'google') return this.continueWithGoogle();
    if (provider === 'tiktok') {
      ACIControl?.reply('TikTok login — enable custom OIDC in Supabase, then wire provider tiktok.');
      return;
    }
    if (!this.OAUTH_PROVIDERS.includes(provider)) return;
    this.closeLoginModal();
    const origin = this.publicOrigin();
    GlobeDeck?.setPreview?.('Sign in · ' + origin);
    ACIControl?.reply('Sign in at ' + origin + ' with ' + provider);
    const redirectTo = this._oauthRedirectTo();
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        scopes: provider === 'facebook' ? 'email profile' : undefined,
      },
    });
    if (data?.url) window.location.assign(data.url);
    if (error) throw error;
  },

  _normalizeId(raw) {
    return String(raw || '').trim();
  },

  _emailForUsername(username) {
    return username.toLowerCase().replace(/[^a-z0-9._-]/g, '') + '@users.astranov.eu';
  },

  async signInIdentifier() {
    if (!this.client) return;
    const id = this._normalizeId(document.getElementById('auth-identifier')?.value);
    const password = document.getElementById('auth-password')?.value || '';
    const status = document.getElementById('auth-status');
    if (!id) { if (status) status.textContent = 'Enter email, phone, or username.'; return; }
    try {
      if (/^\+?[\d][\d\s\-()]{7,}$/.test(id)) {
        const { error } = await this.client.auth.signInWithOtp({ phone: id.replace(/\s/g, '') });
        if (error) throw error;
        if (status) status.textContent = 'SMS code sent — enter it when prompted.';
        return;
      }
      const email = id.includes('@') ? id : this._emailForUsername(id);
      if (!password) {
        const { error } = await this.client.auth.signInWithOtp({ email });
        if (error) throw error;
        if (status) status.textContent = 'Magic link sent to ' + email;
        return;
      }
      const { error } = await this.client.auth.signInWithPassword({ email, password });
      if (error && !id.includes('@')) {
        const { error: e2 } = await this.client.auth.signInWithPassword({ email: id, password });
        if (e2) throw error;
      } else if (error) throw error;
      this.closeLoginModal();
      ACIControl?.reply('Signed in — Astranov Identity active');
    } catch (e) {
      if (status) status.textContent = typeof scrubSupabaseLeak === 'function' ? scrubSupabaseLeak(e.message) : (e.message || 'Sign in failed');
    }
  },

  async signUpIdentifier() {
    if (!this.client) return;
    const id = this._normalizeId(document.getElementById('auth-identifier')?.value);
    const password = document.getElementById('auth-password')?.value || '';
    const status = document.getElementById('auth-status');
    if (!id || password.length < 6) {
      if (status) status.textContent = 'Username/email + password (6+ chars) required.';
      return;
    }
    const email = id.includes('@') ? id : this._emailForUsername(id);
    try {
      const { error } = await this.client.auth.signUp({
        email,
        password,
        options: { data: { username: id.includes('@') ? id.split('@')[0] : id, display_name: id } }
      });
      if (error) throw error;
      if (status) status.textContent = 'Account created — check email if confirmation is on.';
      this.closeLoginModal();
    } catch (e) {
      if (status) status.textContent = e.message || 'Sign up failed';
    }
  },

  async signInPhoneOtp() {
    if (!this.client) return;
    const phone = this._normalizeId(document.getElementById('auth-phone')?.value).replace(/\s/g, '');
    const code = this._normalizeId(document.getElementById('auth-otp')?.value);
    const status = document.getElementById('auth-status');
    if (!phone) { if (status) status.textContent = 'Enter phone with country code e.g. +3069…'; return; }
    try {
      if (!code) {
        const { error } = await this.client.auth.signInWithOtp({ phone });
        if (error) throw error;
        if (status) status.textContent = 'Code sent — enter OTP and tap Verify.';
        return;
      }
      const { error } = await this.client.auth.verifyOtp({ phone, token: code, type: 'sms' });
      if (error) throw error;
      this.closeLoginModal();
      ACIControl?.reply('Phone verified — signed in');
    } catch (e) {
      if (status) status.textContent = e.message || 'Phone sign-in failed';
    }
  },

  async whenReady() {
    return this.ensureSession();
  },

  async ensureSession() {
    if (!this.client) return null;
    if (this.session?.access_token) {
      const exp = this.session.expires_at ? this.session.expires_at * 1000 : 0;
      if (!exp || exp >= Date.now() + 120000) return this.session;
    }
    const { data } = await this.client.auth.getSession();
    let session = data?.session || null;
    if (!session?.access_token) return null;
    const exp = session.expires_at ? session.expires_at * 1000 : 0;
    if (exp && exp < Date.now() + 120000) {
      const { data: refreshed, error } = await this.client.auth.refreshSession();
      if (!error && refreshed?.session) {
        session = refreshed.session;
        this._authDegraded = false;
      } else if (this.user) {
        this._authDegraded = true;
        this.applyUser();
      }
    }
    this.session = session;
    return session;
  },

  async loadProfileVisual() {
    if (!this.client || !this.user?.id) return;
    try {
      const { data } = await this.client.from('profiles')
        .select('display_name, avatar_emoji')
        .eq('id', this.user.id)
        .maybeSingle();
      if (data) {
        this._profileVisual = data;
        this.applyUser();
      }
    } catch (_) {}
  },

  async authHeaders() {
    const h = { 'Content-Type': 'application/json', apikey: SB_KEY };
    let token = this.session?.access_token;
    if (!token) {
      const session = await this.ensureSession();
      token = session?.access_token;
    }
    h.Authorization = token ? 'Bearer ' + token : 'Bearer ' + SB_KEY;
    return h;
  },

  handoffPayload() {
    const s = this.session;
    if (!s?.access_token) return null;
    return {
      type: 'astranov-auth',
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: s.expires_at,
      user: {
        id: this.user?.id,
        email: this.user?.email,
        name: this.user?.user_metadata?.full_name || this.user?.user_metadata?.name,
        avatar: this.user?.user_metadata?.avatar_url || this.user?.user_metadata?.picture,
      }
    };
  },

  broadcastToShell() {
    const frame = document.getElementById('as-shell-frame');
    const payload = this.handoffPayload();
    if (frame?.contentWindow && payload) {
      try { frame.contentWindow.postMessage(payload, '*'); } catch { /* */ }
    }
  },

  _onChildMessage(e) {
    if (!e.data || e.data.type !== 'astranov-auth-request') return;
    const payload = this.handoffPayload();
    if (payload && e.source) e.source.postMessage(payload, '*');
  },

  async isSiteOwner(siteId) {
    if (!this.user?.id || !siteId) return false;
    if (this._siteOwners.has(siteId)) return this._siteOwners.get(siteId);
    try {
      const headers = await this.authHeaders();
      const r = await fetch(SB_URL + '/rest/v1/booker_sites?select=owner_id&id=eq.' + encodeURIComponent(siteId) + '&limit=1', { headers });
      const rows = r.ok ? await r.json() : [];
      const ok = rows[0]?.owner_id === this.user.id;
      this._siteOwners.set(siteId, ok);
      return ok;
    } catch { return false; }
  },

  async refreshAuthority() {
    if (!this.user) {
      this.isOwner = false;
      this.isArchitect = false;
      window._aciOwner = false;
      this.updateOwnerUI();
      return;
    }
    const email = (this.user.email || '').toLowerCase();
    // Architect email is authoritative — paid XAI + build bridge only for this account
    this.isArchitect = email === this.OWNER_EMAIL.toLowerCase();
    this.isOwner = this.isArchitect;
    if (this.isArchitect) {
      window._aciOwner = true;
      // Free/SuperGrok first — paid XAI_API_KEY only after free limit (server + notify)
      AciCoders.fallbackPrefs = { force: 'groq', skip: ['xai'] };
      AciCoders.savePrefs?.();
      AiRouter?.setProvider?.('grok');
    } else {
      if (AciCoders?.fallbackPrefs) {
        AciCoders.fallbackPrefs.force = 'groq';
        AciCoders.fallbackPrefs.skip = ['xai'];
      }
    }
    try {
      const r = await fetch(ACI.url + '/functions/v1/aci', {
        method: 'POST',
        headers: await this.authHeaders(),
        body: JSON.stringify({ mode: 'owner_sync' })
      }).then(res => res.json());
      if (r.is_owner || r.is_architect) {
        this.isOwner = true;
        this.isArchitect = this.isArchitect || r.is_architect === true || email === this.OWNER_EMAIL.toLowerCase();
      }
      if (this.isOwner) {
        window._aciOwner = true;
        ACI?.feed('owner-sync', email);
      }
    } catch (_) {
      if (this.client && !this.isArchitect) {
        const { data: prof } = await this.client.from('profiles').select('is_owner').eq('id', this.user.id).single();
        this.isOwner = prof?.is_owner === true;
      }
    }
    this.updateOwnerUI();
    if (this.isArchitect) {
      ACIControl?.reply?.('Architect online · Bridge ready · fix / code from the street');
      // Public users never see this line; architect-only mission tone OK here
      CliRibbon?.setNotice?.('Bridge armed · fix/dev', 'ready');
      ArchitectBridge?.arm?.({ quiet: true });
    } else {
      ArchitectBridge?.disarm?.();
    }
    if (window.FieldBrain) FieldBrain.onAuth();
    if (window.AciCli) AciCli.onAuthChange();
    this.loadProfileVisual();
    ContextTruth?.syncAuth?.();
  },

  updateOwnerUI() {
    const chip = document.getElementById('user-chip');
    if (this.isOwner && chip) {
      chip.textContent = 'ASTRANOV · OWNER';
      chip.style.color = '#00dd77';
    }
    if (this.isOwner) CliRibbon?.setActive?.('owner');
    const prompt = document.getElementById('aci-cli-prompt');
    if (prompt && this.isOwner) prompt.textContent = 'ASTRANOV@collective $';
    const bridgeBtn = document.getElementById('aci-bridge');
    if (bridgeBtn) bridgeBtn.hidden = !this.isArchitect;
    SuperCli?.setContext?.(SuperCli?.inferContext?.() || 'idle');
    ArchitectBridge?._bindUi?.();
  },

  async signOut() {
    if (!this.client) return;
    await AstranovPresence?.leave?.();
    await this.client.auth.signOut();
    this.user = null;
    this.session = null;
    this.isOwner = false;
    this.isArchitect = false;
    this._siteOwners.clear();
    window._aciOwner = false;
    ArchitectBridge?.disarm?.();
    this.applyUser();
    this.updateOwnerUI();
    this.broadcastToShell();
    ArcangeloDialect?.reset?.();
    if (Voice.maySpeak()) speak('Signed out.', () => {}, true);
  },

  applyUser() {
    const btn = document.getElementById('aci-login');
    const chip = document.getElementById('user-chip');
    if (this.user) {
      const isOwner = AstranovSession?.isAstranov?.()
        || this.isOwner || this.isArchitect
        || (this.user.email || '').toLowerCase() === this.OWNER_EMAIL.toLowerCase();
      const name = isOwner ? 'ASTRANOV' : (
        this._profileVisual?.display_name
        || this.user.user_metadata?.full_name
        || this.user.user_metadata?.name
        || (this.user.email || '').split('@')[0]
        || 'User'
      );
      const avatar = this.user.user_metadata?.avatar_url
        || this.user.user_metadata?.picture;
      const emoji = this._profileVisual?.avatar_emoji;
      if (btn) {
        btn.classList.remove('auth-out', 'auth-boot');
        btn.classList.add(this._authDegraded ? 'auth-degraded' : 'auth-in');
        btn.dataset.auth = this._authDegraded ? 'degraded' : 'in';
        btn.title = (this._authDegraded ? 'Session refreshing · ' : 'Signed in · ') + name + ' — tap to fly to you & edit profile';
        btn.style.backgroundSize = 'cover';
        btn.style.backgroundPosition = 'center';
        if (avatar) {
          btn.style.backgroundImage = 'url(' + avatar + ')';
          btn.textContent = '';
        } else if (emoji) {
          btn.style.backgroundImage = '';
          btn.textContent = emoji;
          btn.style.fontSize = '18px';
        } else {
          btn.textContent = name.charAt(0).toUpperCase();
          btn.style.backgroundImage = '';
          btn.style.fontSize = '13px';
        }
      }
      if (chip && !this.isOwner) {
        chip.textContent = name + (this._authDegraded ? ' · ⟳' : ' · ●');
        chip.style.color = this._authDegraded ? '#ffaa44' : '';
      }
      AstranovSession?._applyIdentity?.();
      if (typeof me !== 'undefined' && me) {
        me.name = name;
        me.id = this.user.id;
        me.email = this.user.email;
        me.isOwner = this.isOwner;
        me.isGuest = false;
      }
      AstranovSession?.onAuth?.();
      AstranovPresence?.join?.();
      ACI?.feed('login', name);
      if (window.AciCli) AciCli.onAuthChange();
      FieldBrain?.updateChip?.();
      CliRibbon?.render?.();
      ContextTruth?.syncAuth?.();
    } else {
      if (btn) {
        btn.classList.remove('auth-in', 'auth-degraded');
        btn.classList.add(this._authBoot ? 'auth-boot' : 'auth-out');
        btn.dataset.auth = 'out';
        btn.title = 'Sign in at astranov.eu — Google · email · phone';
        btn.textContent = 'G';
        btn.style.backgroundImage = '';
        btn.style.fontSize = '13px';
      }
      if (chip) {
        chip.textContent = '';
        chip.style.color = '';
      }
      if (window.AciCli) AciCli.onAuthChange();
      CliRibbon?.render?.();
      ContextTruth?.syncAuth?.();
    }
  }
};
window.Auth = Auth;
